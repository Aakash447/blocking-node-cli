# Blocking Node CLI - Proxy Helper Script
# Use this to manually enable/disable Windows proxy or check status

param(
    [Parameter(Position=0)]
    [ValidateSet("enable", "disable", "status", "help")]
    [string]$Action = "help"
)

$proxyServer = "127.0.0.1:3128"
$bypassList = "localhost;127.*;10.*;172.16.*;172.31.*;192.168.*;<local>"

function Enable-SystemProxy {
    Write-Host "`n🔧 Enabling Windows system proxy..." -ForegroundColor Cyan
    
    try {
        # Set registry values
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -Value 1 -Type DWord -ErrorAction Stop
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyServer -Value $proxyServer -ErrorAction Stop
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyOverride -Value $bypassList -ErrorAction Stop
        
        # Notify Windows of settings change
        $signature = @"
[DllImport("wininet.dll")]
public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
"@
        $wininet = Add-Type -MemberDefinition $signature -Name WinInet -Namespace Win32 -PassThru
        $wininet::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
        $wininet::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
        
        Write-Host "✅ System proxy ENABLED: $proxyServer" -ForegroundColor Green
        Write-Host "   Don't forget to restart your browser!" -ForegroundColor Yellow
    }
    catch {
        Write-Host "❌ Failed to enable proxy: $_" -ForegroundColor Red
        Write-Host "   Try running PowerShell as Administrator" -ForegroundColor Yellow
    }
}

function Disable-SystemProxy {
    Write-Host "`n🔧 Disabling Windows system proxy..." -ForegroundColor Cyan
    
    try {
        # Disable proxy
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -Value 0 -Type DWord -ErrorAction Stop
        
        # Notify Windows of settings change
        $signature = @"
[DllImport("wininet.dll")]
public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
"@
        $wininet = Add-Type -MemberDefinition $signature -Name WinInet -Namespace Win32 -PassThru
        $wininet::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
        $wininet::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
        
        Write-Host "✅ System proxy DISABLED" -ForegroundColor Green
        Write-Host "   Restart your browser if needed" -ForegroundColor Yellow
    }
    catch {
        Write-Host "❌ Failed to disable proxy: $_" -ForegroundColor Red
    }
}

function Get-ProxyStatus {
    Write-Host "`n🔍 Checking Windows proxy settings..." -ForegroundColor Cyan
    Write-Host "═" * 60
    
    try {
        $proxyEnable = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -ErrorAction Stop
        $proxyServerReg = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyServer -ErrorAction SilentlyContinue
        $proxyOverride = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyOverride -ErrorAction SilentlyContinue
        
        Write-Host ""
        if ($proxyEnable.ProxyEnable -eq 1) {
            Write-Host "Status: " -NoNewline
            Write-Host "ENABLED ✅" -ForegroundColor Green
        } else {
            Write-Host "Status: " -NoNewline
            Write-Host "DISABLED ❌" -ForegroundColor Red
        }
        
        Write-Host "Proxy Server: $($proxyServerReg.ProxyServer)"
        Write-Host "Bypass List: $($proxyOverride.ProxyOverride)"
        
        # Check if configured for Blocking Node CLI
        if ($proxyEnable.ProxyEnable -eq 1 -and $proxyServerReg.ProxyServer -eq $proxyServer) {
            Write-Host "`n✅ Correctly configured for Blocking Node CLI" -ForegroundColor Green
        } elseif ($proxyEnable.ProxyEnable -eq 1) {
            Write-Host "`n⚠️  Proxy enabled but not pointing to $proxyServer" -ForegroundColor Yellow
            Write-Host "   Run: .\proxy-helper.ps1 enable" -ForegroundColor Yellow
        } else {
            Write-Host "`n⚠️  Proxy is disabled" -ForegroundColor Yellow
            Write-Host "   The blocking service won't work without proxy enabled" -ForegroundColor Yellow
            Write-Host "   Run: .\proxy-helper.ps1 enable" -ForegroundColor Yellow
        }
        
        # Check if service is listening on port 3128
        Write-Host ""
        $listening = Get-NetTCPConnection -LocalPort 3128 -State Listen -ErrorAction SilentlyContinue
        if ($listening) {
            Write-Host "🌐 Proxy server is LISTENING on port 3128 ✅" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Proxy server is NOT running on port 3128" -ForegroundColor Yellow
            Write-Host "   Start it with: node index.js service --start" -ForegroundColor Yellow
        }
        
    }
    catch {
        Write-Host "❌ Error reading proxy settings: $_" -ForegroundColor Red
    }
    
    Write-Host "═" * 60
    Write-Host ""
}

function Show-Help {
    Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║     Blocking Node CLI - Proxy Helper                        ║
╚══════════════════════════════════════════════════════════════╝

USAGE:
    .\proxy-helper.ps1 <command>

COMMANDS:
    enable      Enable Windows system proxy (127.0.0.1:3128)
    disable     Disable Windows system proxy
    status      Check current proxy configuration
    help        Show this help message

EXAMPLES:
    .\proxy-helper.ps1 status          # Check proxy status
    .\proxy-helper.ps1 enable          # Enable proxy manually
    .\proxy-helper.ps1 disable         # Disable proxy manually

NOTE:
    • This script modifies Windows proxy settings
    • You may need to run PowerShell as Administrator
    • Always restart your browser after changing proxy settings
    • Use this if automatic proxy setup fails

"@
}

# Main script logic
switch ($Action) {
    "enable" { Enable-SystemProxy }
    "disable" { Disable-SystemProxy }
    "status" { Get-ProxyStatus }
    "help" { Show-Help }
    default { Show-Help }
}
