# AI Agent Instructions: Blocking Node CLI

## Project Overview
Blocking Node CLI is a Windows-only productivity tool that blocks websites and applications based on customizable schedules. It runs as a background service with both interactive CLI and programmatic interfaces.

## Architecture & Component Interactions

### Component Structure
```
index.js (CLI entry point with commander + inquirer)
  ↓
ScheduleManager (manages schedule CRUD, config persistence)
  ↓
BlockingService (orchestrates blocking logic, proxy, monitoring)
  ├─ ProxyServer (HTTP/HTTPS proxy on port 3128 for network interception)
  └─ Windows system integration (hosts file, process management, system proxy)

ConfigManager (parallel config utility - not currently used in production flow)
```

### Data Flow
1. User enters schedule configuration via CLI ([index.js](index.js#L40-L150))
2. ScheduleManager validates and stores in [data/config.json](data/config.json)
3. BlockingService loads config and creates blocking rules
4. ProxyServer intercepts traffic; BlockingService kills processes based on active schedule
5. Monitoring loop checks every 3 seconds if schedule is active (default interval in [ConfigManager](src/ConfigManager.js#L23))

## Critical Implementation Details

### Admin Privileges: Non-Negotiable
- [BlockingService.checkAdminPrivileges()](src/BlockingService.js#L17-L26) validates at startup
- Fails silently if not admin; displays `displayAdminWarning()` banner
- **Every feature requires admin**: modifying system proxy, killing processes, installing services
- Must test with both PowerShell and Command Prompt admin terminals

### Service Lifecycle
- **Start**: Enables system proxy → starts proxy server → begins monitoring loop
- **Stop**: Disables system proxy → closes proxy → clears blocked apps → flushes DNS cache
- Graceful shutdown on Ctrl+C ([BlockingService.start()](src/BlockingService.js#L58-L80))
- PID stored in `data/service.pid` for multi-instance checking

### Schedule Validation & Matching
- Time format: `HH:MM` (24-hour, enforced via regex `/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/`)
- Schedule types: `time` (between start/end), `alltime` (always active), `morning` (legacy, check implementation)
- Schedule name must be unique (enforced in [ScheduleManager.createSchedule()](src/ScheduleManager.js#L30-L32))
- Schedule stored with: name, type, start, end, websites[], keywords[], apps[], enabled flag, created timestamp

### Blocking Mechanisms
1. **Websites**: ProxyServer intercepts HTTP/HTTPS requests, blocks via keyword matching in request headers/body
2. **Apps**: BlockingService kills processes by name ([search for exec commands](src/BlockingService.js)) using Windows `taskkill /IM`
3. **DNS Flushing**: Ensures immediate effect after config changes (executor: PowerShell `ipconfig /flushdns`)

## Developer Workflows

### Running Locally
```powershell
# Admin PowerShell required
npm install
node index.js           # Interactive mode (prompted menu)
node index.js schedule  # Schedule management (sub-menu)
node index.js service --start  # Start service with proxy
```

### Testing Common Scenarios
- Use `run-admin.ps1` or `run-admin.bat` to elevate privileges automatically
- Test files exist but test script in package.json is placeholder; no actual test suite

### Command Structure
- Main entry: `node index.js` → interactive menu
- Sub-commands: `schedule`, `block`, `service` each have CLI flags and interactive fallback
- Interactive prompts use [inquirer](index.js#L50-L120) with validation (e.g., time format validator)

## Project-Specific Conventions

### File Organization
- **CLI/UX logic**: [index.js](index.js) (504 lines - command definitions + inquirer prompts)
- **Business logic**: [src/](src/) (service, scheduling, config management)
- **Data**: [data/config.json](data/config.json) (persisted config), [data/config.json.example](data/config.json.example) (reference)
- **Scripts**: `run-admin.ps1`, `run-admin.bat` (elevation helpers), `test.ps1`, `test.bat` (stubs)

### Error Handling Pattern
- Use try/catch in async functions
- Error messages prefixed with emoji for CLI clarity (✅ success, ❌ error, ⚠️ warning, 🌐 info)
- Admin privilege errors show formatted `displayAdminWarning()` banner instead of stack trace

### Configuration Schema
```javascript
{
  schedules: [
    {
      name: string,           // Unique identifier
      type: 'time'|'alltime'|'morning',
      start: "HH:MM",         // 24-hour format
      end: "HH:MM",
      websites: string[],     // domain names
      keywords: string[],     // substring matching in requests
      apps: string[],         // executable names (e.g., "chrome.exe")
      enabled: boolean,
      created: ISO8601 timestamp
    }
  ]
}
```

### Monitoring Loop
- Interval: Every 3 seconds (ConfigManager line 23, also hardcoded in BlockingService)
- Check: Is current time within any active schedule?
- Action: Apply current schedule's blocked list; log changes only if state differs from previous check

## External Dependencies
- **commander**: CLI argument parsing with sub-commands
- **inquirer**: Interactive prompts for menu-driven UX  
- **Node.js built-ins**: fs (config persistence), child_process (exec - kill processes), http/net (proxy)
- **Platform-specific**: Windows `taskkill`, `ipconfig`, system proxy registry/netsh

## Key Files to Study
1. [index.js](index.js) - Understand how CLI flows and error handling works
2. [src/BlockingService.js](src/BlockingService.js) - Core blocking logic and service lifecycle
3. [src/ScheduleManager.js](src/ScheduleManager.js) - How configs are validated and persisted
4. [src/ProxyServer.js](src/ProxyServer.js) - Network interception mechanism
5. [README.md](README.md) - Complete feature list and example commands

## Common Edge Cases
- **Overlapping schedules**: Not explicitly prevented; most recent wins (check matching logic)
- **Time wraparound** (end < start, e.g., 23:00–05:00): Supported via custom calculation
- **Process already killed**: taskkill will just report process not found; caught in error handling
- **Config file corruption**: Falls back to default schema and re-creates file


dont create .md file on implementing anything