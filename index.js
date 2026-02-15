#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const BlockingService = require('./src/BlockingService');
const ScheduleManager = require('./src/ScheduleManager');

const blockingService = new BlockingService();
const scheduleManager = new ScheduleManager(blockingService);

// Main menu function
async function showMainMenu() {
  console.clear();
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '🚦 Blocking Node CLI - What would you like to do?',
      choices: [
        { name: '📅 Manage Schedules', value: 'schedule' },
        { name: '🚫 Manage Blocked Items', value: 'block' },
        { name: '⚙️  Manage Service', value: 'service' },
        { name: '🧪 Test Proxy Connection', value: 'test-proxy' },
        { name: '� Flush DNS Cache', value: 'flush-dns' },
        { name: '�🔍 Debug Information', value: 'debug' },
        { name: '❌ Exit', value: 'exit' }
      ]
    }
  ]);

  if (action === 'exit') {
    console.log('Goodbye! 👋');
    process.exit(0);
  }

  return action;
}

program
  .name('blocking-node-cli')
  .description('CLI app for blocking applications and websites with scheduling')
  .version('1.0.0');

// Schedule management commands
program
  .command('schedule')
  .description('Manage blocking schedules')
  .option('-c, --create <name>', 'Create a new schedule')
  .option('-l, --list', 'List all schedules')
  .option('-d, --delete <name>', 'Delete a schedule')
  .option('-s, --start <time>', 'Start time (HH:MM)')
  .option('-e, --end <time>', 'End time (HH:MM)')
  .option('-t, --type <type>', 'Schedule type: time, alltime, morning')
  .action(async (options) => {
    try {
      // Interactive mode if no options provided
      if (!options.create && !options.list && !options.delete) {
        await handleScheduleInteractive();
        return;
      }

      // Command-line mode (original behavior)
      if (options.create) {
        if (!options.start || !options.end || !options.type) {
          console.error('Error: --start, --end, and --type are required when creating a schedule');
          process.exit(1);
        }
        await scheduleManager.createSchedule(options.create, {
          start: options.start,
          end: options.end,
          type: options.type
        });
        console.log(`Schedule "${options.create}" created successfully`);
      } else if (options.list) {
        const schedules = await scheduleManager.listSchedules();
        console.log('Schedules:');
        schedules.forEach(schedule => {
          console.log(`  ${schedule.name}: ${schedule.start} - ${schedule.end} (${schedule.type})`);
        });
      } else if (options.delete) {
        await scheduleManager.deleteSchedule(options.delete);
        console.log(`Schedule "${options.delete}" deleted successfully`);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Block management commands
program
  .command('block')
  .description('Manage blocked items')
  .option('-a, --add <item>', 'Add website/app/keyword to block')
  .option('-r, --remove <item>', 'Remove website/app/keyword from block')
  .option('-s, --schedule <name>', 'Schedule to assign to')
  .option('-l, --list', 'List all blocked items')
  .option('-t, --type <type>', 'Type: website, keyword, or app')
  .action(async (options) => {
    try {
      // Interactive mode if no options provided
      if (!options.add && !options.remove && !options.list) {
        await handleBlockInteractive();
        return;
      }

      // Command-line mode (original behavior)
      if (options.add) {
        if (!options.schedule || !options.type) {
          console.error('Error: --schedule and --type are required when adding items');
          process.exit(1);
        }
        if (!['website', 'keyword', 'app'].includes(options.type)) {
          console.error('Error: --type must be one of: website, keyword, app');
          process.exit(1);
        }
        await scheduleManager.addItemToSchedule(options.schedule, options.add, options.type);
        console.log(`${options.type} "${options.add}" added to schedule "${options.schedule}"`);
      } else if (options.remove) {
        if (!options.schedule) {
          console.error('Error: --schedule is required when removing items');
          process.exit(1);
        }
        await scheduleManager.removeItemFromSchedule(options.schedule, options.remove);
        console.log(`Item "${options.remove}" removed from schedule "${options.schedule}"`);
      } else if (options.list) {
        const schedules = await scheduleManager.listSchedules();
        schedules.forEach(schedule => {
          console.log(`\nSchedule: ${schedule.name}`);
          if (schedule.websites && schedule.websites.length > 0) {
            schedule.websites.forEach(site => console.log(`  Website: ${site}`));
          }
          if (schedule.keywords && schedule.keywords.length > 0) {
            schedule.keywords.forEach(kw => console.log(`  Keyword: ${kw}`));
          }
          if (schedule.apps && schedule.apps.length > 0) {
            schedule.apps.forEach(app => console.log(`  App: ${app}`));
          }
        });
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Test proxy connectivity
program
  .command('test-proxy')
  .description('Test if proxy server is receiving traffic')
  .action(async () => {
    try {
      console.log('\n🧪 PROXY CONNECTIVITY TEST\n');
      console.log('═'.repeat(60));
      
      // Check if service is running
      const isRunning = await blockingService.getStatus();
      if (!isRunning) {
        console.log('❌ Service is not running. Start it first with: node index.js service --start');
        return;
      }
      
      console.log('✅ Service is running');
      
      // Check if port is listening
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      try {
        const { stdout } = await execAsync('netstat -an | findstr "3128"');
        if (stdout.includes('LISTENING')) {
          console.log('✅ Proxy server is listening on port 3128');
        } else {
          console.log('❌ Port 3128 is NOT listening');
          return;
        }
      } catch (error) {
        console.log('❌ Port 3128 is NOT listening');
        return;
      }
      
      // Try to make a request through the proxy
      console.log('\n📡 Testing proxy by making a request through 127.0.0.1:3128...');
      console.log('   Target: http://example.com');
      
      const http = require('http');
      
      const options = {
        host: '127.0.0.1',
        port: 3128,
        path: 'http://example.com',
        method: 'GET',
        headers: {
          'Host': 'example.com',
          'User-Agent': 'BlockingNodeCLI-Test/1.0'
        }
      };
      
      const req = http.request(options, (res) => {
        console.log(`\n✅ SUCCESS! Proxy responded with status: ${res.statusCode}`);
        console.log('   This means your proxy is working correctly!');
        console.log('\n💡 Next steps:');
        console.log('   1. Configure your browser to use proxy: 127.0.0.1:3128');
        console.log('   2. In Chrome/Edge: Settings → System → Open proxy settings');
        console.log('   3. In Firefox: Settings → Network Settings → Manual proxy');
        console.log('   4. Try accessing facebook.com or pinterest.com');
        console.log('   5. Watch the service terminal for blocking logs');
        console.log('\n═'.repeat(60));
        
        res.on('data', () => {}); // Consume response
      });
      
      req.on('error', (err) => {
        console.log(`\n❌ FAILED to connect to proxy!`);
        console.log(`   Error: ${err.message}`);
        console.log('\n💡 Possible issues:');
        console.log('   1. Proxy server not actually running');
        console.log('   2. Port 3128 blocked by firewall');
        console.log('   3. Another process using port 3128');
        console.log('\n═'.repeat(60));
      });
      
      req.setTimeout(5000, () => {
        console.log('\n⏱️  Request timed out - proxy may not be responding');
        req.destroy();
      });
      
      req.end();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Flush DNS cache command
program
  .command('flush-dns')
  .description('Flush DNS cache to apply blocking immediately')
  .action(async () => {
    try {
      console.log('🔄 Flushing DNS cache...');
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      await execAsync('ipconfig /flushdns');
      console.log('✅ DNS cache flushed successfully');
      console.log('💡 Blocked sites should now be blocked immediately');
      console.log('   (no need to wait for cached DNS entries to expire)');
    } catch (error) {
      console.error('❌ Error flushing DNS cache:', error.message);
      console.log('⚠️  You may need to run this as Administrator');
    }
  });

// Debug/test command
program
  .command('debug')
  .description('Debug and test blocking functionality')
  .action(async () => {
    try {
      console.log('\n🔍 BLOCKING SERVICE DEBUG INFORMATION\n');
      console.log('═'.repeat(60));
      
      // Check if service is running
      const isRunning = await blockingService.getStatus();
      console.log(`\n📊 Service Status: ${isRunning ? '🟢 Running' : '🔴 Stopped'}`);
      
      if (!isRunning) {
        console.log('\n⚠️  Service is not running. Start it with: node index.js service --start');
        console.log('⚠️  Or test proxy connectivity with: node index.js test-proxy');
        return;
      }
      
      // Load and display config
      const config = await scheduleManager.listSchedules();
      console.log(`\n📅 Schedules: ${config.length} total`);
      
      config.forEach(schedule => {
        console.log(`\n   • ${schedule.name} (${schedule.type}):`);
        console.log(`     Time: ${schedule.start} - ${schedule.end}`);
        console.log(`     Websites: [${(schedule.websites || []).join(', ')}]`);
        console.log(`     Keywords: [${(schedule.keywords || []).join(', ')}]`);
        console.log(`     Apps: [${(schedule.apps || []).join(', ')}]`);
      });
      
      // Check proxy configuration
      console.log('\n🌐 Windows Proxy Configuration:');
      try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        const { stdout } = await execAsync('netsh winhttp show proxy');
        console.log(stdout);
      } catch (error) {
        console.log('   ❌ Could not read proxy settings');
      }
      
      // Check if port is listening
      console.log('🔌 Proxy Server Port Check:');
      try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        const { stdout } = await execAsync('netstat -an | findstr "3128"');
        if (stdout.includes('LISTENING')) {
          console.log('   ✅ Port 3128 is LISTENING');
        } else {
          console.log('   ❌ Port 3128 is NOT listening');
        }
        console.log(stdout);
      } catch (error) {
        console.log('   ❌ Port 3128 is NOT listening');
      }
      
      console.log('\n💡 Troubleshooting Tips:');
      console.log('   1. Make sure service is running: node index.js service --start');
      console.log('   2. Run as Administrator (required for proxy setup)');
      console.log('   3. Configure browser to use proxy 127.0.0.1:3128');
      console.log('   4. Try accessing a blocked site - watch logs in service terminal');
      console.log('   5. For Firefox: Manual proxy config required (see README)');
      console.log('\n═'.repeat(60));
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  });

// Service management commands
program
  .command('service')
  .description('Manage blocking service (requires administrator privileges)')
  .option('-s, --start', 'Start blocking service')
  .option('-x, --stop', 'Stop blocking service')
  .option('-r, --restart', 'Restart blocking service')
  .option('-t, --status', 'Check service status')
  .option('-i, --install', 'Install service to start on boot')
  .option('-u, --uninstall', 'Uninstall service from boot')
  .action(async (options) => {
    try {
      // Interactive mode if no options provided
      if (!options.start && !options.stop && !options.restart && !options.status && !options.install && !options.uninstall) {
        await handleServiceInteractive();
        return;
      }

      // Command-line mode (original behavior)
      if (options.start) {
        await blockingService.start();
      } else if (options.stop) {
        await blockingService.stop();
        console.log('🟢 Blocking service stopped');
      } else if (options.restart) {
        await blockingService.restart();
        console.log('🔄 Blocking service restarted');
      } else if (options.status) {
        const status = await blockingService.getStatus();
        console.log(`Service status: ${status ? '🟢 Running' : '🔴 Stopped'}`);
      } else if (options.install) {
        await blockingService.installService();
        console.log('🎯 Service installed to start on boot');
      } else if (options.uninstall) {
        await blockingService.uninstallService();
        console.log('❌ Service uninstalled from boot');
      }
    } catch (error) {
      if (error.message === 'Administrator privileges required') {
        process.exit(1);
      } else {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }
    }
  });

// Main interactive loop
async function runInteractiveMode() {
  let continueMainLoop = true;
  
  while (continueMainLoop) {
    const command = await showMainMenu();
    
    if (command === 'exit') {
      continueMainLoop = false;
      break;
    }
    
    // Execute the selected command in interactive mode
    try {
      if (command === 'schedule') {
        await handleScheduleInteractive();
      } else if (command === 'block') {
        await handleBlockInteractive();
      } else if (command === 'service') {
        const shouldExit = await handleServiceInteractive();
        if (shouldExit) {
          // Service is running in foreground, exit menu to avoid interference
          continueMainLoop = false;
          break;
        }
      } else if (command === 'test-proxy' || command === 'debug' || command === 'flush-dns') {
        // Run as subprocess to execute the command
        process.argv = ['node', 'index.js', command];
        program.parse(process.argv);
        await inquirer.prompt([{ type: 'input', name: 'continue', message: '\nPress Enter to continue...' }]);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

// Extract interactive handlers
async function handleScheduleInteractive() {
  let continueLoop = true;
  while (continueLoop) {
    console.clear();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '➕ Create new schedule', value: 'create' },
          { name: '📋 List all schedules', value: 'list' },
          { name: '🗑️  Delete a schedule', value: 'delete' },
          { name: '⬅️  Back to main menu', value: 'cancel' }
        ]
      }
    ]);

    if (action === 'cancel') {
      continueLoop = false;
      break;
    }

    if (action === 'create') {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Enter schedule name:',
          validate: (input) => input.trim() ? true : 'Schedule name is required'
        },
        {
          type: 'list',
          name: 'type',
          message: 'Select schedule type:',
          choices: [
            { name: 'Time-based (specific hours)', value: 'time' },
            { name: 'All day (24/7)', value: 'alltime' },
            { name: 'Morning only', value: 'morning' }
          ]
        },
        {
          type: 'input',
          name: 'start',
          message: 'Start time - 24-hour format (example: 09:00):',
          default: '00:00',
          validate: (input) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(input) ? true : 'Invalid time format. Use HH:MM like 09:00 or 14:30'
        },
        {
          type: 'input',
          name: 'end',
          message: 'End time - 24-hour format (example: 17:00):',
          default: '23:59',
          validate: (input) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(input) ? true : 'Invalid time format. Use HH:MM like 09:00 or 14:30'
        }
      ]);

      await scheduleManager.createSchedule(answers.name, {
        start: answers.start,
        end: answers.end,
        type: answers.type
      });
      console.log(`✅ Schedule "${answers.name}" created successfully\n`);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    } else if (action === 'list') {
      const schedules = await scheduleManager.listSchedules();
      if (schedules.length === 0) {
        console.log('No schedules found. Create one first!\n');
      } else {
        console.log('\n📋 Schedules:');
        schedules.forEach(schedule => {
          console.log(`  • ${schedule.name}: ${schedule.start} - ${schedule.end} (${schedule.type})`);
        });
        console.log('');
      }
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    } else if (action === 'delete') {
      const schedules = await scheduleManager.listSchedules();
      if (schedules.length === 0) {
        console.log('No schedules found.\n');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        continue;
      }

      const { scheduleName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'scheduleName',
          message: 'Select schedule to delete:',
          choices: schedules.map(s => ({ name: s.name, value: s.name }))
        }
      ]);

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete "${scheduleName}"?`,
          default: false
        }
      ]);

      if (confirm) {
        await scheduleManager.deleteSchedule(scheduleName);
        console.log(`✅ Schedule "${scheduleName}" deleted successfully\n`);
      } else {
        console.log('Cancelled\n');
      }
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function handleBlockInteractive() {
  let continueLoop = true;
  while (continueLoop) {
    console.clear();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '➕ Add item to block', value: 'add' },
          { name: '➖ Remove item from block', value: 'remove' },
          { name: '📋 List all blocked items', value: 'list' },
          { name: '⬅️  Back to main menu', value: 'cancel' }
        ]
      }
    ]);

    if (action === 'cancel') {
      continueLoop = false;
      break;
    }

    if (action === 'add') {
      const schedules = await scheduleManager.listSchedules();
      if (schedules.length === 0) {
        console.log('❌ No schedules found. Please create a schedule first using: node index.js schedule\n');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        continue;
      }

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'schedule',
          message: 'Select schedule:',
          choices: schedules.map(s => ({ name: `${s.name} (${s.start} - ${s.end})`, value: s.name }))
        },
        {
          type: 'list',
          name: 'type',
          message: 'What do you want to block?',
          choices: [
            { name: '🌐 Website (e.g., facebook.com)', value: 'website' },
            { name: '🔍 Keyword in URLs (e.g., gambling, adult)', value: 'keyword' },
            { name: '💻 Application (e.g., chrome.exe)', value: 'app' }
          ]
        }
      ]);

      // Handle item selection based on type
      let item;
      if (answers.type === 'app') {
        // Get running applications
        console.log('🔍 Loading running applications...');
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        try {
          const { stdout } = await execAsync('tasklist /FO CSV /NH');
          const lines = stdout.trim().split('\n');
          let apps = [...new Set(lines.map(line => {
            const match = line.match(/^"([^"]+)"/);
            return match ? match[1] : null;
          }).filter(Boolean))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
          
          console.log('\n💡 TIP: Make sure the application you want to block is currently running!');
          console.log('   Only running applications appear in this list.\n');
          
          // Search/filter option
          const { searchTerm } = await inquirer.prompt([
            {
              type: 'input',
              name: 'searchTerm',
              message: 'Filter applications (leave empty to see all):',
              default: ''
            }
          ]);
          
          // Filter apps if search term provided
          if (searchTerm.trim()) {
            const filtered = apps.filter(app => 
              app.toLowerCase().includes(searchTerm.toLowerCase())
            );
            
            if (filtered.length === 0) {
              console.log(`⚠️  No applications found matching "${searchTerm}"`);
              apps = apps; // Show all apps
            } else {
              apps = filtered;
              console.log(`✅ Found ${filtered.length} application(s) matching "${searchTerm}"`);
            }
          }
          
          const { selectedApp } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedApp',
              message: 'Select application to block:',
              choices: [...apps, new inquirer.Separator(), '⬅️  Back to menu'],
              pageSize: 15
            }
          ]);
          
          if (selectedApp === '⬅️  Back to menu') {
            continue;
          }
          
          item = selectedApp;
        } catch (error) {
          console.log('⚠️  Failed to load running applications. Using manual input instead.');
          const { manualApp } = await inquirer.prompt([
            {
              type: 'input',
              name: 'manualApp',
              message: 'Enter application name (e.g., chrome.exe):',
              validate: (input) => input.trim() ? true : 'Application name is required'
            }
          ]);
          item = manualApp;
        }
      } else {
        // For website and keyword, use text input
        const { inputItem } = await inquirer.prompt([
          {
            type: 'input',
            name: 'inputItem',
            message: answers.type === 'website' 
              ? 'Enter website domain (e.g., facebook.com):'
              : 'Enter keyword to block in URLs:',
            validate: (input) => input.trim() ? true : 'This field is required'
          }
        ]);
        item = inputItem;
      }

      await scheduleManager.addItemToSchedule(answers.schedule, item, answers.type);
      console.log(`✅ ${answers.type} "${item}" added to schedule "${answers.schedule}"\n`);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    } else if (action === 'remove') {
      const schedules = await scheduleManager.listSchedules();
      if (schedules.length === 0) {
        console.log('❌ No schedules found.\n');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        continue;
      }

      const { schedule } = await inquirer.prompt([
        {
          type: 'list',
          name: 'schedule',
          message: 'Select schedule:',
          choices: schedules.map(s => ({ name: s.name, value: s }))
        }
      ]);

      // Build list of all items
      const items = [];
      if (schedule.websites) {
        schedule.websites.forEach(w => items.push({ name: `🌐 Website: ${w}`, value: w }));
      }
      if (schedule.keywords) {
        schedule.keywords.forEach(k => items.push({ name: `🔍 Keyword: ${k}`, value: k }));
      }
      if (schedule.apps) {
        schedule.apps.forEach(a => items.push({ name: `💻 App: ${a}`, value: a }));
      }

      if (items.length === 0) {
        console.log('❌ No items found in this schedule.\n');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        continue;
      }

      const { item } = await inquirer.prompt([
        {
          type: 'list',
          name: 'item',
          message: 'Select item to remove:',
          choices: items
        }
      ]);

      await scheduleManager.removeItemFromSchedule(schedule.name, item);
      console.log(`✅ Item "${item}" removed from schedule "${schedule.name}"\n`);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    } else if (action === 'list') {
      const schedules = await scheduleManager.listSchedules();
      if (schedules.length === 0) {
        console.log('No schedules found.\n');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        continue;
      }

      console.log('\n📋 Blocked Items by Schedule:\n');
      schedules.forEach(schedule => {
        console.log(`📅 Schedule: ${schedule.name}`);
        let hasItems = false;

        if (schedule.websites && schedule.websites.length > 0) {
          hasItems = true;
          schedule.websites.forEach(site => console.log(`   🌐 Website: ${site}`));
        }
        if (schedule.keywords && schedule.keywords.length > 0) {
          hasItems = true;
          schedule.keywords.forEach(kw => console.log(`   🔍 Keyword: ${kw}`));
        }
        if (schedule.apps && schedule.apps.length > 0) {
          hasItems = true;
          schedule.apps.forEach(app => console.log(`   💻 App: ${app}`));
        }

        if (!hasItems) {
          console.log('   (no items blocked)');
        }
        console.log('');
      });
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
}

async function handleServiceInteractive() {
  let continueLoop = true;
  while (continueLoop) {
    console.clear();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Service Management - What would you like to do?',
        choices: [
          { name: '▶️  Start blocking service', value: 'start' },
          { name: '⏹️  Stop blocking service', value: 'stop' },
          { name: '🔄 Restart blocking service', value: 'restart' },
          { name: '📊 Check service status', value: 'status' },
          { name: '⚙️  Install service (run on boot)', value: 'install' },
          { name: '🗑️  Uninstall service', value: 'uninstall' },
          { name: '⬅️  Back to main menu', value: 'cancel' }
        ]
      }
    ]);

    if (action === 'cancel') {
      continueLoop = false;
      break;
    }

    if (action === 'start') {
      console.clear();
      console.log('🚀 Starting blocking service...');
      console.log('⚠️  This requires administrator privileges');
      console.log('\n💡 The service will run continuously until you press Ctrl+C\n');
      
      // Start service and let it run (don't return to menu)
      await blockingService.start();
      // Service runs continuously here, will only exit on Ctrl+C or error
      // Return true to signal main loop to exit and avoid menu interference
      return true;
    } else if (action === 'stop') {
      console.log('🛑 Stopping blocking service...');
      await blockingService.stop();
      console.log('✅ Blocking service stopped\n');
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    } else if (action === 'restart') {
      console.clear();
      console.log('🔄 Restarting blocking service...');
      console.log('\n💡 The service will run continuously until you press Ctrl+C\n');
      
      await blockingService.restart();
      // Service runs continuously here, will only exit on Ctrl+C or error
      // Return true to signal main loop to exit and avoid menu interference
      return true;
    } else if (action === 'status') {
      const status = await blockingService.getStatus();
      console.log(`\n📊 Service status: ${status ? '🟢 Running' : '🔴 Stopped'}\n`);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    } else if (action === 'install') {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Install service to start automatically on boot?',
          default: false
        }
      ]);

      if (confirm) {
        await blockingService.installService();
        console.log('✅ Service installed to start on boot\n');
      } else {
        console.log('Cancelled\n');
      }
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    } else if (action === 'uninstall') {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Uninstall service from automatic startup?',
          default: false
        }
      ]);

      if (confirm) {
        await blockingService.uninstallService();
        console.log('✅ Service uninstalled from boot\n');
      } else {
        console.log('Cancelled\n');
      }
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    }
  }
  
  // Return false if we're just going back to main menu (not starting service)
  return false;
}

// Show main menu if no command provided
(async () => {
  // Check if no command was provided
  if (process.argv.length === 2) {
    await runInteractiveMode();
  } else {
    program.parse();
  }
})();