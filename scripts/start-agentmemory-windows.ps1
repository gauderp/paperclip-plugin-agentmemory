#Requires -Version 5.1
<#
.SYNOPSIS
  Start agentmemory iii-engine + REST worker on Windows (127.0.0.1).

.DESCRIPTION
  - Stops orphan listeners on :3111 / :49134 (bare iii.exe without /agentmemory routes).
  - Sets AGENTMEMORY_URL to http://127.0.0.1:3111 (avoids localhost -> ::1 ECONNREFUSED).
  - Starts @agentmemory/agentmemory via npx from the parent workspace (has node_modules).
#>
$ErrorActionPreference = "Stop"

function Get-ListeningPid([int]$Port) {
  $line = netstat -ano | Select-String "LISTENING" | Select-String ":$Port\s"
  if (-not $line) { return $null }
  return [int](($line.ToString() -split '\s+')[-1])
}

function Stop-PortListener([int]$Port) {
  $listenPid = Get-ListeningPid $Port
  if ($listenPid) {
    Write-Host "Stopping PID $listenPid on port $Port"
    Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
  }
}

$connectorRoot = Split-Path $PSScriptRoot -Parent
$workspace = Split-Path $connectorRoot -Parent
$pkg = Join-Path $workspace "node_modules\@agentmemory\agentmemory"
if (-not (Test-Path $pkg)) {
  throw "Missing package at $pkg - run npm install in $workspace"
}

$env:Path = "$env:USERPROFILE\.local\bin;" + $env:Path
$env:AGENTMEMORY_URL = "http://127.0.0.1:3111"
$env:III_ENGINE_URL = "ws://127.0.0.1:49134"
$env:CI = "1"

Stop-PortListener 3111
Stop-PortListener 49134
Start-Sleep -Seconds 2

# Orphan iii without agentmemory routes leaves 404 on /agentmemory/* - always recycle.
Get-Process -Name "iii" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "Starting agentmemory from $workspace ..."
$logDir = Join-Path $PSScriptRoot ".logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "agentmemory-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

Start-Process -FilePath "cmd.exe" `
  -ArgumentList @("/c", "npx --yes @agentmemory/agentmemory > `"$logFile`" 2>&1") `
  -WorkingDirectory $workspace `
  -WindowStyle Hidden | Out-Null

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3111/agentmemory/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) {
      Write-Host "agentmemory healthy (log: $logFile)"
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

Write-Host "Timed out waiting for /agentmemory/health - see $logFile"
exit 1
