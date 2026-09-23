$ErrorActionPreference = 'Stop'

$taskName = 'LongChau-EndOfDay-Sync'
$scriptPath = Join-Path $PSScriptRoot 'run_daily.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At 23:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Collect Long Chau, Bach Hoa Xanh, and Tiem Chung Long Chau data once at the end of each day.' -Force
Write-Output "Scheduled task '$taskName' configured for 23:00 daily."