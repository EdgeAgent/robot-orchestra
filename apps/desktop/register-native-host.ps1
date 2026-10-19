$ErrorActionPreference = 'Stop'
$extensionId = (Get-Content (Join-Path $PSScriptRoot 'EXTENSION_ID') -Raw).Trim()
$hostExe = Join-Path $PSScriptRoot 'RobotOrchestra.NativeHost.exe'
if (-not (Test-Path $hostExe)) { throw "Native host not found: $hostExe. Reinstall Robot Orchestra." }
$manifestPath = Join-Path $PSScriptRoot 'ai.robotheads.orchestra.json'
$manifest = @{ name='ai.robotheads.orchestra'; description='Robot Orchestra local browser context bridge'; path=$hostExe; type='stdio'; allowed_origins=@("chrome-extension://$extensionId/") } | ConvertTo-Json -Depth 4
Set-Content -Path $manifestPath -Value $manifest -Encoding ascii
foreach ($browserPath in @('Software\Google\Chrome\NativeMessagingHosts\ai.robotheads.orchestra','Software\Microsoft\Edge\NativeMessagingHosts\ai.robotheads.orchestra')) {
  New-Item -Path "HKCU:\$browserPath" -Force | Out-Null
  Set-Item -Path "HKCU:\$browserPath" -Value $manifestPath
}
Write-Host 'Robot Orchestra native messaging host registered for Chrome and Edge (current Windows user).'
Write-Host 'In each browser, open Extensions, enable Developer mode, and load the bundled browser-extension folder.'
