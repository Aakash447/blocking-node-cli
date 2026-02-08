#!/usr/bin/env node

const { program } = require('commander');
const BlockingService = require('./src/BlockingService');
const ScheduleManager = require('./src/ScheduleManager');

const blockingService = new BlockingService();
const scheduleManager = new ScheduleManager(blockingService);

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
      console.error('Error:', error.message);
    }
  });

// Block management commands
program
  .command('block')
  .description('Manage blocked items')
  .option('-a, --add <item>', 'Add website/app to block')
  .option('-r, --remove <item>', 'Remove website/app from block')
  .option('-s, --schedule <name>', 'Schedule to assign to')
  .option('-l, --list', 'List all blocked items')
  .option('-t, --type <type>', 'Type: website or app')
  .action(async (options) => {
    try {
      if (options.add) {
        if (!options.schedule || !options.type) {
          console.error('Error: --schedule and --type are required when adding items');
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
          schedule.websites.forEach(site => console.log(`  Website: ${site}`));
          schedule.apps.forEach(app => console.log(`  App: ${app}`));
        });
      }
    } catch (error) {
      console.error('Error:', error.message);
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

program.parse();