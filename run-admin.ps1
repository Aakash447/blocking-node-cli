# Blocking Node CLI - PowerShell Admin Launcher
# This script ensures the CLI runs with administrator privileges

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Show-Menu {
    Clear-Host
    Write-Host "🛡️  Blocking Node CLI - Administrator Mode" -ForegroundColor Green
    Write-Host "=" * 45 -ForegroundColor Green
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Start blocking service" -ForegroundColor White
    Write-Host "2. Stop blocking service" -ForegroundColor White  
    Write-Host "3. Check service status" -ForegroundColor White
    Write-Host "4. List schedules" -ForegroundColor White
    Write-Host "5. List blocked items" -ForegroundColor White
    Write-Host "6. Install auto-start service" -ForegroundColor White
    Write-Host "7. Create new schedule" -ForegroundColor White
    Write-Host "8. Add website/app to block" -ForegroundColor White
    Write-Host "9. Custom command" -ForegroundColor White
    Write-Host "0. Exit" -ForegroundColor White
    Write-Host ""
}

function Invoke-NodeCommand {
    param([string]$Command)
    
    try {
        Write-Host "Running: node index.js $Command" -ForegroundColor Cyan
        & node index.js $Command.Split(' ')
        Write-Host ""
    }
    catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
    }
}

# Check if running as administrator
if (-not (Test-Administrator)) {
    Write-Host "⚠️  Administrator privileges required!" -ForegroundColor Red
    Write-Host ""
    Write-Host "This script will restart with administrator privileges..." -ForegroundColor Yellow
    Write-Host "Please click 'Yes' when prompted by Windows UAC." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to continue"
    
    # Re-run this script as administrator
    Start-Process PowerShell -ArgumentList "-File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "✓ Running with administrator privileges" -ForegroundColor Green
Write-Host ""

# Main menu loop
do {
    Show-Menu
    $choice = Read-Host "Enter your choice (0-9)"
    Write-Host ""
    
    switch ($choice) {
        "1" {
            Invoke-NodeCommand "service --start"
            Read-Host "Press Enter to continue"
        }
        "2" {
            Invoke-NodeCommand "service --stop"
            Read-Host "Press Enter to continue"
        }
        "3" {
            Invoke-NodeCommand "service --status"
            Read-Host "Press Enter to continue"
        }
        "4" {
            Invoke-NodeCommand "schedule --list"
            Read-Host "Press Enter to continue"
        }
        "5" {
            Invoke-NodeCommand "block --list"
            Read-Host "Press Enter to continue"
        }
        "6" {
            Invoke-NodeCommand "service --install"
            Read-Host "Press Enter to continue"
        }
        "7" {
            Write-Host "Create New Schedule" -ForegroundColor Yellow
            Write-Host "=================" -ForegroundColor Yellow
            $name = Read-Host "Schedule name"
            $type = Read-Host "Schedule type (time/alltime)"
            
            if ($type -eq "time") {
                $start = Read-Host "Start time (HH:MM)"
                $end = Read-Host "End time (HH:MM)"
                Invoke-NodeCommand "schedule --create `"$name`" --start `"$start`" --end `"$end`" --type `"$type`""
            } else {
                Invoke-NodeCommand "schedule --create `"$name`" --type `"$type`""
            }
            Read-Host "Press Enter to continue"
        }
        "8" {
            Write-Host "Add Website/App to Block" -ForegroundColor Yellow
            Write-Host "========================" -ForegroundColor Yellow
            $item = Read-Host "Website/App to block (e.g., facebook.com or chrome.exe)"
            $schedule = Read-Host "Schedule name to add to"
            $type = Read-Host "Type (website/app)"
            
            Invoke-NodeCommand "block --add `"$item`" --schedule `"$schedule`" --type `"$type`""
            Read-Host "Press Enter to continue"
        }
        "9" {
            $custom = Read-Host "Enter custom command (e.g., schedule --create `"test`" --start `"14:00`" --end `"16:00`" --type `"time`")"
            Invoke-NodeCommand $custom
            Read-Host "Press Enter to continue"
        }
        "0" {
            Write-Host "Goodbye! 👋" -ForegroundColor Green
            break
        }
        default {
            Write-Host "Invalid choice. Please enter 0-9." -ForegroundColor Red
            Read-Host "Press Enter to continue"
        }
    }
} while ($choice -ne "0")