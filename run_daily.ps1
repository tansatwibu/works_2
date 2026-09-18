$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'logs') | Out-Null

$env:HEADLESS = 'true'
$logPath = Join-Path $PSScriptRoot ("logs\crawl-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

& npm run crawl *>> $logPath
if ($LASTEXITCODE -ne 0) {
    throw "Daily crawl failed with exit code $LASTEXITCODE. See $logPath"
}