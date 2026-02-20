# PowerShell test script for Blocking CLI
Write-Host "Testing Blocking CLI Application" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

try {
    Write-Host "Testing schedule creation..." -ForegroundColor Yellow
    & node index.js schedule --create "test-schedule" --start "14:00" --end "15:00" --type "time"
    
    Write-Host ""
    Write-Host "Testing website blocking..." -ForegroundColor Yellow
    & node index.js block --add "facebook.com" --schedule "test-schedule" --type "website"
    
    Write-Host ""
    Write-Host "Testing app blocking..." -ForegroundColor Yellow
    & node index.js block --add "notepad.exe" --schedule "test-schedule" --type "app"
    
    Write-Host ""
    Write-Host "Listing all schedules..." -ForegroundColor Yellow
    & node index.js schedule --list
    
    Write-Host ""
    Write-Host "Listing all blocked items..." -ForegroundColor Yellow
    & node index.js block --list
    
    Write-Host ""
    Write-Host "Test completed successfully!" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "To test the service, run as administrator:" -ForegroundColor Cyan
    Write-Host "  node index.js service --start" -ForegroundColor White
    Write-Host "  node index.js service --status" -ForegroundColor White
    Write-Host "  node index.js service --stop" -ForegroundColor White
    
    Write-Host ""
    Write-Host "Cleaning up test schedule..." -ForegroundColor Yellow
    & node index.js schedule --delete "test-schedule"
    
} catch {
    Write-Host "Error during testing: $($_.Exception.Message)" -ForegroundColor Red
}