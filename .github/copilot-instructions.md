# Blocking Node CLI - AI Coding Agent Instructions

## Architecture Overview

This is a Windows-specific CLI application that blocks websites and applications using schedule-based rules. Three core classes form the service boundary:

- **BlockingService** (`src/BlockingService.js`): System-level enforcement layer that modifies `C:\Windows\System32\drivers\etc\hosts` for website blocking and uses `taskkill` for app termination. Runs continuous monitoring loop (3-second intervals) when active.
- **ScheduleManager** (`src/ScheduleManager.js`): Business logic for schedule CRUD operations and item management (websites/apps). Normalizes website URLs to `https://www.domain.com` format and auto-appends `.exe` to app names.
- **ConfigManager** (`src/ConfigManager.js`): JSON persistence layer at `data/config.json` with stats aggregation and import/export utilities.

Data flows: CLI → ScheduleManager → ConfigManager → JSON file → BlockingService reads config → System enforcement (hosts file + taskkill).

## Critical Conventions

### Administrator Privileges Pattern
Every system-modifying operation checks admin privileges first using `checkAdminPrivileges()` (attempts write to `C:\Windows\Temp`). On failure, displays formatted warning via `displayAdminWarning()` and throws `'Administrator privileges required'`. **Never bypass this check**.

### State Management
- BlockingService maintains `hostsIsModified` flag to avoid unnecessary restore operations
- `previouslyBlockedWebsites` and `previouslyBlockedApps` arrays prevent duplicate console logs
- PID file at `data/service.pid` tracks running service, stop signal file at `data/stop.signal`

### Website Normalization
ScheduleManager's `normalizeWebsite()` method enforces URL consistency:
```javascript
// Input: "facebook.com" or "https://facebook.com"
// Output: "https://www.facebook.com"
```
When modifying hosts file, strips protocol and generates both `www.` and non-`www.` entries for comprehensive blocking.

## Development Workflows

### Testing/Running Commands
**Always use PowerShell admin launcher for interactive testing:**
```powershell
# Interactive menu with admin privileges
.\run-admin.ps1

# Or direct command execution
node index.js service --start  # Runs in foreground, Ctrl+C to stop
```

Service runs in **foreground** by default (blocking terminal). Use separate terminal for stop command or Ctrl+C for graceful shutdown.

### Configuration Structure
`data/config.json` schema:
```json
{
  "version": "1.0.0",
  "schedules": [{
    "name": "work-focus",
    "type": "time|alltime|morning",
    "start": "09:00",
    "end": "17:00",
    "websites": ["https://www.facebook.com"],
    "apps": ["chrome.exe"],
    "enabled": true,
    "created": "2026-02-05T..."
  }],
  "settings": {
    "checkInterval": 3000,
    "logLevel": "info"
  }
}
```

### Schedule Time Logic
`isScheduleActive()` in BlockingService handles cross-midnight ranges:
```javascript
// "23:00" to "05:00" = active from 11 PM to 5 AM next day
if (startTime <= endTime) { /* same day */ }
else { /* crosses midnight: now >= start OR now <= end */ }
```

## Integration Points

### Windows Task Scheduler
`installService()` creates XML-based scheduled task (`BlockingNodeCLI`) that runs on boot with highest privileges. Task executes: `node index.js service --start`. Uninstall via `schtasks /delete`.

### DNS Cache Management
After every hosts file modification, automatically runs `ipconfig /flushdns` via `execAsync` for immediate effect. No manual intervention needed.

### File Locations
- Hosts backup: `data/hosts.backup` (created on first service start)
- Config: `data/config.json` (auto-created with defaults if missing)
- Process tracking: `data/service.pid`, `data/stop.signal`

## Gotchas

1. **Time format**: 24-hour `HH:MM` format only. Validated with regex `/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/`
2. **App blocking**: Requires `.exe` extension - auto-appended if missing but **check `taskkill` compatibility** with target process name
3. **Hosts file restoration**: Only occurs when `hostsIsModified === true`. Service cleanup removes `# BLOCKED BY CLI` comment markers
4. **Error handling**: EPERM errors trigger admin warning display. Process "not found" errors from taskkill are silently ignored (expected behavior)
5. **Commander.js usage**: All CLI commands use option flags (`-s`, `--start`) not positional args

## Adding Features Checklist

When extending schedule types or blocking mechanisms:
1. Update `isScheduleActive()` switch statement in BlockingService
2. Add validation in ScheduleManager's `createSchedule()`
3. Update ConfigManager's `schedulesByType` aggregation
4. Modify CLI command options in `index.js` (commander.js)
5. Consider admin privilege requirements for new system operations

## Key Files Reference
- Entry point: `index.js` (commander.js CLI definitions)
- Core logic: `src/BlockingService.js` (400+ lines - hosts/process manipulation)
- Business rules: `src/ScheduleManager.js` (schedule validation + normalization)
- Persistence: `src/ConfigManager.js` (JSON config with stats)
- User docs: `USAGE.md` (workflow examples), `README.md` (architecture explanation)
