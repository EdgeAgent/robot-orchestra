!macro customInstall
  ; Register the extension's least-privilege Native Messaging host for this Windows user.
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\ai.robotheads.orchestra" "" "$INSTDIR\resources\native-host\ai.robotheads.orchestra.json"
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\ai.robotheads.orchestra" "" "$INSTDIR\resources\native-host\ai.robotheads.orchestra.json"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\native-host\register-native-host.ps1"'
!macroend
!macro customUnInstall
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\ai.robotheads.orchestra"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\ai.robotheads.orchestra"
!macroend
