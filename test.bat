@echo off
echo Testing Blocking CLI Application
echo ================================
echo.

echo Testing schedule creation...
node index.js schedule --create "test-schedule" --start "14:00" --end "15:00" --type "time"

echo.
echo Testing website blocking...
node index.js block --add "facebook.com" --schedule "test-schedule" --type "website"

echo.
echo Testing app blocking...
node index.js block --add "notepad.exe" --schedule "test-schedule" --type "app"

echo.
echo Listing all schedules...
node index.js schedule --list

echo.
echo Listing all blocked items...
node index.js block --list

echo.
echo Starting service...
node index.js service --start

echo.
echo Checking service status...
node index.js service --status

echo.
echo Test completed! Press any key to stop the service...
pause

echo.
echo Stopping service...
node index.js service --stop

echo.
echo Cleaning up test schedule...
node index.js schedule --delete "test-schedule"

echo.
echo Test completed successfully!