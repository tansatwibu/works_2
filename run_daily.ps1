$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'logs') | Out-Null

# This is an end-of-day snapshot, not a realtime poll.
$env:HEADLESS = 'true'
$logPath = Join-Path $PSScriptRoot ("logs\crawl-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

& npm run crawl -- --sync-mode=end-of-day *>> $logPath
if ($LASTEXITCODE -ne 0) {
    throw "Daily crawl failed with exit code $LASTEXITCODE. See $logPath"
}