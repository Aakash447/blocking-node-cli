# Quick Start Guide - Blocking Node CLI
block-cli service --install  on administer command line
## Prerequisites
- Windows Operating System
- Node.js installed
- **Run Command Prompt as Administrator** (important!)

## Getting Started

### 1. Basic Setup
```cmd
# Navigate to the project folder
cd d:\projects\blocking-node-cli

# Install dependencies
npm install
```

### 2. Create Your First Schedule

#### Example 1: Block Social Media During Work Hours
```cmd
# Create a work schedule (9 AM to 5 PM)
node index.js schedule --create "work-focus" --start "09:00" --end "19:00" --type "time"

# Add social media websites to block
node index.js block --add "facebook.com" --schedule "work-focus" --type "website"
node index.js block --add "x.com" --schedule "work-focus" --type "website"
node index.js block --add "instagram.com" --schedule "work-focus" --type "website"
node index.js block --add "youtube.com" --schedule "work-focus" --type "website"

# Start the blocking service (requires admin privileges)
node index.js service --start
```

#### Example 2: Block Browsers at Night
```cmd
# Create a night schedule (11 PM to 5 AM)
node index.js schedule --create "night-block" --start "23:00" --end "05:00" --type "time"

# Block browser applications
node index.js block --add "chrome.exe" --schedule "full-block" --type "app"
node index.js block --add "firefox.exe" --schedule "full-block" --type "app"
node index.js block --add "msedge.exe" --schedule "full-block" --type "app"

# Start the service if not already running
node index.js service --start
```

#### Example 3: Permanently Block Specific Sites
```cmd
# Create an always-on schedule
node index.js schedule --create "permanent-block" --type "alltime"

# Add permanently blocked sites
node index.js block --add "distractingsite.com" --schedule "permanent-block" --type "website"
node index.js block --add "games.com" --schedule "permanent-block" --type "website"
```

### 3. Manage Your Configuration

#### View Current Setup
```cmd
# List all schedules
node index.js schedule --list

# List all blocked items
node index.js block --list
```

#### Modify Schedules
```cmd
# Remove an item from a schedule
node index.js block --remove "facebook.com" --schedule "work-focus"

# Delete an entire schedule
node index.js schedule --delete "old-schedule"
```

### 4. Service Management

#### Manual Control
```cmd
# Start blocking service (runs in foreground)
node index.js service --start

# Check if service is running
node index.js service --status

# Stop blocking service (use from another terminal, or Ctrl+C in the running terminal)
node index.js service --stop

# Restart service
node index.js service --restart
```

**Note**: When you start the service with `--start`, it runs continuously in the terminal. You can stop it by:
- Pressing `Ctrl+C` in the same terminal (graceful shutdown)
- Running `node index.js service --stop` from another terminal

#### Auto-Start on Windows Boot
```cmd
# Install service to start automatically
node index.js service --install

# Remove auto-start
node index.js service --uninstall
```

## Schedule Types

### Time-based Blocking
- **Format**: `--type "time" --start "HH:MM" --end "HH:MM"`
- **Example**: Block from 2 PM to 4 PM: `--start "14:00" --end "16:00"`
- **Overnight**: Block from 11 PM to 5 AM: `--start "23:00" --end "05:00"`

### Always-On Blocking
- **Format**: `--type "alltime"`
- **Use case**: Permanently block harmful or distracting sites

## Common Use Cases

### 1. Parental Controls
```cmd
# Block inappropriate content all day
node index.js schedule --create "parental" --type "alltime"
node index.js block --add "inappropriate-site.com" --schedule "parental" --type "website"

# Block games during school hours
node index.js schedule --create "school-hours" --start "08:00" --end "15:00" --type "time"
node index.js block --add "steam.exe" --schedule "school-hours" --type "app"
node index.js block --add "minecraft.exe" --schedule "school-hours" --type "app"
```

### 2. Productivity Boost
```cmd
# Block social media during work
node index.js schedule --create "deep-work" --start "09:00" --end "12:00" --type "time"
node index.js block --add "reddit.com" --schedule "deep-work" --type "website"
node index.js block --add "tiktok.com" --schedule "deep-work" --type "website"

# Block messaging apps during focus time
node index.js block --add "discord.exe" --schedule "deep-work" --type "app"
node index.js block --add "slack.exe" --schedule "deep-work" --type "app"
```

### 3. Digital Detox
```cmd
# Complete internet break on weekends (manual schedule)
node index.js schedule --create "weekend-detox" --start "18:00" --end "23:59" --type "time"
node index.js block --add "chrome.exe" --schedule "weekend-detox" --type "app"
node index.js block --add "firefox.exe" --schedule "weekend-detox" --type "app"
```

## Important Notes

### Administrator Privileges Required
- Always run Command Prompt as Administrator
- Required for modifying hosts file and killing processes

### How It Works
- **Websites**: Modifies Windows hosts file to redirect domains to localhost
- **Applications**: Uses taskkill to terminate specified processes
- **Monitoring**: Checks every 3 seconds and enforces rules

### Backup and Safety
- Automatically backs up your original hosts file
- Service stop restores original hosts file
- Configuration stored in `data/config.json`

## Troubleshooting

### Service Won't Start
1. Check that you're running as Administrator
2. Verify Node.js is installed: `node --version`
3. Check for antivirus interference

### Websites Not Blocked
1. Clear browser cache
2. Restart browser
3. Check DNS settings
4. Verify schedule is active for current time

### Apps Keep Restarting
1. Some apps have auto-restart features
2. Close from system tray if applicable
3. Check for app launchers or managers

### Reset Everything
```cmd
# Stop service and clean up
node index.js service --stop

# Delete all schedules (you'll need to recreate)
# Or manually delete: data\config.json
```

## Advanced Tips

### Multiple Schedules
- You can have multiple schedules active at the same time
- Example: Work hours block + permanent block
- Items from all active schedules will be blocked

### Time Format
- Use 24-hour format: 14:00 for 2 PM
- Overnight schedules work: 23:00 to 05:00

### Adding Domains
- Add both `example.com` and `www.example.com` if needed
- App automatically adds both versions for websites

### Finding App Names
- Use Task Manager to find exact .exe names
- Common browsers: chrome.exe, firefox.exe, msedge.exe
- Games: Look in installation folder for .exe file

## Getting Help

### Command Help
```cmd
# Main help
node index.js --help

# Schedule help
node index.js schedule --help

# Block help
node index.js block --help

# Service help
node index.js service --help
```

### Example Configurations
See the examples above or run the test script to see basic functionality.

If you need to stop the background service, you may need to uninstall it with node [index.js](http://_vscodecontentref_/1) service --uninstall and then reinstall if desired, as stopping from the CLI won't affect the background task.