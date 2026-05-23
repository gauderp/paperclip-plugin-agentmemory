#Requires -Version 5.1
<#
.SYNOPSIS
  Smoke-test agentmemory REST on Windows using 127.0.0.1 (QA / CUS-56 gate).

.NOTES
  Upstream `agentmemory demo` hardcodes http://localhost:3111; Node on Windows often
  connects to ::1 while iii-http binds 127.0.0.1 only. This script is the supported
  Windows verification path until @agentmemory/agentmemory fixes demo base URL.
#>
$ErrorActionPreference = "Stop"

$base = if ($env:AGENTMEMORY_URL) { $env:AGENTMEMORY_URL.TrimEnd("/") } else { "http://127.0.0.1:3111" }
$failures = @()

function Assert-Ok([string]$Name, [scriptblock]$Block) {
  try {
    & $Block
    Write-Host "[PASS] $Name"
  } catch {
    $failures += "$Name - $($_.Exception.Message)"
    Write-Host "[FAIL] $Name - $($_.Exception.Message)"
  }
}

Assert-Ok "GET /agentmemory/health" {
  $r = Invoke-WebRequest -Uri "$base/agentmemory/health" -UseBasicParsing -TimeoutSec 10
  if ($r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode)" }
  $j = $r.Content | ConvertFrom-Json
  if ($j.status -ne "healthy") { throw "status=$($j.status)" }
}

Assert-Ok "GET /agentmemory/livez" {
  $r = Invoke-WebRequest -Uri "$base/agentmemory/livez" -UseBasicParsing -TimeoutSec 10
  if ($r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode)" }
}

$demoProject = "paperclip-demo-$(Get-Date -Format 'yyyyMMddHHmmss')"
$sessionId = "demo-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
$cwd = if ($PWD.Path) { $PWD.Path } else { "C:\Users\Desktop" }

Assert-Ok "POST observe + smart-search (demo path)" {
  Invoke-RestMethod -Uri "$base/agentmemory/session/start" -Method POST -Body (@{
    sessionId = $sessionId; project = $demoProject; cwd = $cwd
  } | ConvertTo-Json) -ContentType "application/json" | Out-Null
  $ts = (Get-Date).ToUniversalTime().ToString("o")
  $observe = @{
    hookType  = "post_tool_use"
    sessionId = $sessionId
    project   = $demoProject
    cwd       = $cwd
    timestamp = $ts
    data      = @{
      tool_name   = "edit"
      tool_input  = @{ file = "auth.ts" }
      tool_output = "CUS-64 verify: JWT auth middleware and rate limiting on Paperclip host."
    }
  } | ConvertTo-Json -Depth 6
  Invoke-RestMethod -Uri "$base/agentmemory/observe" -Method POST -Body $observe -ContentType "application/json" | Out-Null
  Start-Sleep -Seconds 10
  $search = @{ query = "jwt auth rate limiting middleware"; project = $demoProject; limit = 5 } | ConvertTo-Json
  $hits = Invoke-RestMethod -Uri "$base/agentmemory/smart-search" -Method POST -Body $search -ContentType "application/json"
  if (-not $hits.results -or $hits.results.Count -lt 1) { throw "smart-search returned no results" }
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Verification failed:"
  $failures | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host ""
Write-Host "All checks passed against $base"
exit 0
