/**
 * A fixed PowerShell script: wait up to 8 seconds for the WhatsApp window to be the one in front,
 * give the chat a moment to load, check again, then press Enter. If WhatsApp is never in front,
 * it presses nothing. No text from the user or the model is ever put into this script.
 */
export const WHATSAPP_ENTER_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NovaFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
Add-Type -AssemblyName System.Windows.Forms
function InFront {
  $id = 0
  [void][NovaFg]::GetWindowThreadProcessId([NovaFg]::GetForegroundWindow(), [ref]$id)
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  return ($p -and $p.ProcessName -match '^WhatsApp')
}
$deadline = (Get-Date).AddSeconds(8)
while ((Get-Date) -lt $deadline) {
  if (InFront) {
    Start-Sleep -Milliseconds 1500
    if (InFront) {
      [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
      exit 0
    }
  }
  Start-Sleep -Milliseconds 300
}
exit 2
`
