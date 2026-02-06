# Blocking Node CLI

A powerful CLI application for blocking websites and applications on Windows with advanced scheduling features.

## Features

- ✅ Block websites by modifying Windows hosts file
- ✅ Kill application processes to block apps
- ✅ Multiple scheduling options (time-based, all-time blocking)
- ✅ CLI interface for easy management
- ✅ Auto-start with Windows boot
- ✅ DNS cache flushing for immediate effect

## Requirements

- Windows Operating System
- Node.js 14.0.0 or higher
- Administrator privileges (required for modifying hosts file and killing processes)

## Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:
   ```cmd
   npm install
   ```
4. Install globally (optional):
   ```cmd
   npm install -g
   ```

## Usage

### Basic Commands

Run the CLI with administrator privileges for all operations.

#### Schedule Management

Create a new schedule:
```cmd
node index.js schedule --create "evening-block" --start "23:00" --end "05:00" --type "time"
```

List all schedules:
```cmd
node index.js schedule --list
```

Delete a schedule:
```cmd
node index.js schedule --delete "evening-block"
```

#### Adding Items to Block

Add a website to a schedule:
```cmd
node index.js block --add "facebook.com" --schedule "evening-block" --type "website"
```

Add an application to a schedule:
```cmd
node index.js block --add "chrome.exe" --schedule "evening-block" --type "app"
```

List all blocked items:
```cmd
node index.js block --list
```

Remove an item from a schedule:
```cmd
node index.js block --remove "facebook.com" --schedule "evening-block"
```

#### Service Management

Start the blocking service:
```cmd
node index.js service --start
```

Stop the blocking service:
```cmd
node index.js service --stop
```

Check service status:
```cmd
node index.js service --status
```

Install service to start on boot:
```cmd
node index.js service --install
```

Uninstall service from boot:
```cmd
node index.js service --uninstall
```

### Schedule Types

1. **time**: Block during specific hours
   - Example: Block from 11 PM to 5 AM
   - Format: `--start "23:00" --end "05:00"`

2. **alltime**: Block continuously
   - Example: Permanent blocking
   - Times are ignored for this type

3. **morning**: Block during morning hours (future feature)

### Example Workflows

#### 1. Block social media during work hours
```cmd
# Create work hours schedule
node index.js schedule --create "work-hours" --start "09:00" --end "17:00" --type "time"

# Add social media sites
node index.js block --add "facebook.com" --schedule "work-hours" --type "website"
node index.js block --add "twitter.com" --schedule "work-hours" --type "website"
node index.js block --add "instagram.com" --schedule "work-hours" --type "website"

# Start the service
node index.js service --start
```

#### 2. Block browsers at night
```cmd
# Create night schedule
node index.js schedule --create "night-block" --start "23:00" --end "05:00" --type "time"

# Block browsers
node index.js block --add "chrome.exe" --schedule "night-block" --type "app"
node index.js block --add "firefox.exe" --schedule "night-block" --type "app"
node index.js block --add "msedge.exe" --schedule "night-block" --type "app"

# Start the service
node index.js service --start
```

#### 3. Permanently block specific sites
```cmd
# Create permanent block schedule
node index.js schedule --create "permanent-block" --type "alltime"

# Add problematic websites
node index.js block --add "example-bad-site.com" --schedule "permanent-block" --type "website"

# Start the service
node index.js service --start
```

### Auto-start on Boot

To automatically start the blocking service when Windows boots:

1. Install the service:
   ```cmd
   node index.js service --install
   ```

2. The service will now start automatically on system boot and enforce your blocking rules.

## How It Works

### Website Blocking
- Modifies the Windows hosts file (`C:\Windows\System32\drivers\etc\hosts`)
- Redirects blocked domains to `127.0.0.1` (localhost)
- Flushes DNS cache for immediate effect
- Creates backup of original hosts file

### Application Blocking
- Uses `taskkill` command to terminate specified processes
- Monitors and kills processes every 3 seconds when active
- Works with any Windows executable

### Scheduling
- Monitors current time every 3 seconds
- Activates/deactivates blocks based on schedule rules
- Supports cross-midnight time ranges (e.g., 23:00 to 05:00)
- Multiple schedules can be active simultaneously

## Files and Directories

- `index.js` - Main CLI interface
- `src/BlockingService.js` - Core blocking functionality
- `src/ScheduleManager.js` - Schedule management
- `src/ConfigManager.js` - Configuration handling
- `data/config.json` - Configuration storage (created automatically)
- `data/hosts.backup` - Backup of original hosts file

## Important Notes

1. **Administrator Privileges Required**: This app needs to run as administrator to:
   - Modify the hosts file
   - Kill application processes
   - Install Windows scheduled tasks

2. **Windows Only**: This application is specifically designed for Windows and uses Windows-specific commands and file paths.

3. **Backup**: The app automatically creates a backup of your hosts file before making changes.

4. **DNS Cache**: The app flushes DNS cache after modifying hosts file for immediate effect.

## Troubleshooting

### Common Issues

1. **Permission Denied**: Make sure to run Command Prompt as Administrator
2. **Service Won't Start**: Check that Node.js is installed and in PATH
3. **Websites Not Blocked**: Clear browser cache and restart browser
4. **Apps Keep Starting**: Some apps may have auto-restart mechanisms

### Restore Original State
If something goes wrong, you can:
1. Stop the service: `node index.js service --stop`
2. The original hosts file will be automatically restored

## Security Considerations

- Store configuration files securely
- Regularly backup your configuration
- Monitor the app's behavior to ensure it's working as expected
- Be cautious with auto-start functionality

## License

ISC License