@echo off
echo Blocking Node CLI - Administrator Mode
echo =====================================
echo.

REM Check if already running as admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo ✓ Running with administrator privileges
    echo.
    goto :start
) else (
    echo ⚠ Administrator privileges required!
    echo.
    echo This script will restart with administrator privileges...
    echo Please click "Yes" when prompted by Windows UAC.
    echo.
    pause
    
    REM Re-run this script as administrator with proper quoting to prevent command injection
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~nx0\"' -WorkingDirectory '%~dp0' -Verb RunAs"
    goto :end
)

:start
echo Available commands:
echo.
echo 1. Start blocking service
echo 2. Stop blocking service  
echo 3. Check service status
echo 4. List schedules
echo 5. List blocked items
echo 6. Install auto-start service
echo 7. Custom command
echo 8. Exit
echo.

:menu
set /p choice="Enter your choice (1-8): "

if "%choice%"=="1" (
    echo.
    echo Starting blocking service...
    node index.js service --start
    echo.
    goto :menu
)

if "%choice%"=="2" (
    echo.
    echo Stopping blocking service...
    node index.js service --stop
    echo.
    goto :menu
)

if "%choice%"=="3" (
    echo.
    echo Checking service status...
    node index.js service --status
    echo.
    goto :menu
)

if "%choice%"=="4" (
    echo.
    echo Listing schedules...
    node index.js schedule --list
    echo.
    goto :menu
)

if "%choice%"=="5" (
    echo.
    echo Listing blocked items...
    node index.js block --list
    echo.
    goto :menu
)

if "%choice%"=="6" (
    echo.
    echo Installing auto-start service...
    node index.js service --install
    echo.
    goto :menu
)

if "%choice%"=="7" (
    echo.
    echo Enter custom command (e.g., schedule --create "test" --start "14:00" --end "16:00" --type "time"):
    set /p custom="node index.js "
    echo.
    echo Running: node index.js %custom%
    node index.js %custom%
    echo.
    goto :menu
)

if "%choice%"=="8" (
    goto :end
)

echo Invalid choice. Please enter 1-8.
echo.
goto :menu

:end
echo.
echo Goodbye!
pause