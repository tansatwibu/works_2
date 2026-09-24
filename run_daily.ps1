$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'logs') | Out-Null

# This is an end-of-day snapshot, not a realtime poll.
$env:HEADLESS = 'true'
$logPath = Join-Path $PSScriptRoot ("logs\crawl-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

& py -3 .\crawl_nhathuoc.py >> $logPath 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Long Chau crawl failed with exit code $LASTEXITCODE. See $logPath"
}

& py -3 .\crawl_bhx.py >> $logPath 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Bach Hoá Xanh crawl failed with exit code $LASTEXITCODE. See $logPath"
}

& py -3 .\crawl_tiemchung.py >> $logPath 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Tiêm chủng Long Châu crawl failed with exit code $LASTEXITCODE. See $logPath"
}