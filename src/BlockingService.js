const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class BlockingService {
  constructor() {
    this.hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
    this.hostsBackupPath = path.join(__dirname, '../data/hosts.backup');
    this.isRunning = false;
    this.monitoringInterval = null;
    this.configPath = path.join(__dirname, '../data/config.json');
    this.hostsIsModified = false; // Track if hosts file has been modified
    this.previouslyBlockedWebsites = [];
    this.previouslyBlockedApps = [];
    this.pidFilePath = path.join(__dirname, '../data/service.pid');
    this.stopFilePath = path.join(__dirname, '../data/stop.signal');
  }

  async checkAdminPrivileges() {
    try {
      // Try to write a test file to a system directory
      const testPath = 'C:\\Windows\\Temp\\admin_test.txt';
      await fs.writeFile(testPath, 'test', 'utf8');
      await fs.unlink(testPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  displayAdminWarning() {
    console.log('\n⚠️  ADMINISTRATOR PRIVILEGES REQUIRED ⚠️');
    console.log('━'.repeat(50));
    console.log('This application needs administrator privileges to:');
    console.log('• Modify the Windows hosts file');
    console.log('• Kill application processes');
    console.log('• Install system services');
    console.log('');
    console.log('Please run Command Prompt as Administrator:');
    console.log('1. Right-click on Command Prompt');
    console.log('2. Select "Run as administrator"');
    console.log('3. Navigate to this folder and try again');
    console.log('━'.repeat(50));
  }

  async start() {
    try {
      // Check admin privileges first
      const hasAdmin = await this.checkAdminPrivileges();
      if (!hasAdmin) {
        this.displayAdminWarning();
        throw new Error('Administrator privileges required');
      }

      // Create backup of original hosts file
      await this.createHostsBackup();
      
      // Start monitoring
      this.isRunning = true;
      await fs.writeFile(this.pidFilePath, process.pid.toString(), 'utf8');
      this.startMonitoring();
      
      console.log('✅ Blocking service started successfully');
      console.log('Press Ctrl+C to stop the service');
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n🛑 Received shutdown signal...');
        try {
          await this.stop();
          console.log('✅ Service stopped gracefully');
          process.exit(0);
        } catch (error) {
          console.error('❌ Error during shutdown:', error.message);
          process.exit(1);
        }
      });
      
      return true;
    } catch (error) {
      if (error.message === 'Administrator privileges required') {
        throw error;
      }
      console.error('❌ Failed to start blocking service:', error.message);
      throw error;
    }
  }

  async waitForServiceStop(maxWaitMs = 15000, pollIntervalMs = 100) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check if PID file still exists
        await fs.access(this.pidFilePath);
        // File exists, service still running
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        // PID file doesn't exist, service has stopped
        return true;
      }
    }
    
    // Timeout reached
    return false;
  }

  async stop() {
    try {
      // Signal background service to stop
      await fs.writeFile(this.stopFilePath, 'stop', 'utf8');
      
      // Poll for service to stop with timeout
      const serviceStoppedSuccessfully = await this.waitForServiceStop();
      if (!serviceStoppedSuccessfully) {
        console.warn('⚠️  Service did not stop within timeout, forcing cleanup...');
      }
      
      this.isRunning = false;
      try {
        await fs.unlink(this.pidFilePath);
      } catch (error) {
        // Ignore if file doesn't exist
      }
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      // Restore original hosts file only if it was modified
      if (this.hostsIsModified) {
        await this.restoreHostsFile();
        this.hostsIsModified = false;
      }

      // Clear previous blocking state
      this.previouslyBlockedWebsites = [];
      this.previouslyBlockedApps = [];
      
      // Clean up stop file
      try {
        await fs.unlink(this.stopFilePath);
      } catch (error) {
        // Ignore
      }
      
      console.log('Blocking service stopped successfully');
      return true;
    } catch (error) {
      console.error('Failed to stop blocking service:', error);
      throw error;
    }
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async getStatus() {
    try {
      // First check if task is running
      const { stdout } = await execAsync('schtasks /query /tn "BlockingNodeCLI" /fo csv /nh');
      const lines = stdout.trim().split('\n');
      if (lines.length > 0) {
        const fields = lines[0].split(',');
        if (fields.length >= 6 && fields[5].replace(/"/g, '') === 'Running') {
          return true;
        }
      }
    } catch (error) {
      // Task not found or error, continue to check PID file
    }

    // Fallback to PID file
    try {
      await fs.access(this.pidFilePath);
      return true;
    } catch (error) {
      return this.isRunning;
    }
  }

  async startMonitoring() {
    // Monitor every 3 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        // Check for stop signal
        try {
          await fs.access(this.stopFilePath);
          console.log('Stop signal received, shutting down...');
          await this.stop();
          process.exit(0);
        } catch (error) {
          // File doesn't exist, continue monitoring
        }
        await this.enforceBlocking();
      } catch (error) {
        console.error('Error during monitoring:', error);
      }
    }, 3000);

    // Initial enforcement
    await this.enforceBlocking();
  }

  async enforceBlocking() {
    const config = await this.loadConfig();
    const currentTime = new Date();
    
    // Check which schedules are active
    const activeSchedules = config.schedules.filter(schedule => 
      this.isScheduleActive(schedule, currentTime)
    );

    // Collect all websites and apps to block
    let websitesToBlock = [];
    let appsToBlock = [];

    activeSchedules.forEach(schedule => {
      websitesToBlock = [...websitesToBlock, ...schedule.websites];
      appsToBlock = [...appsToBlock, ...schedule.apps];
    });

    // Remove duplicates
    websitesToBlock = [...new Set(websitesToBlock)];
    appsToBlock = [...new Set(appsToBlock)];

    // Apply website blocking
    await this.blockWebsites(websitesToBlock);

    // Apply app blocking
    await this.blockApps(appsToBlock);
  }

  isScheduleActive(schedule, currentTime) {
    const now = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    switch (schedule.type) {
      case 'alltime':
        return true;
      case 'time':
        const [startHour, startMin] = schedule.start.split(':').map(Number);
        const [endHour, endMin] = schedule.end.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        
        if (startTime <= endTime) {
          // Same day
          return now >= startTime && now <= endTime;
        } else {
          // Crosses midnight
          return now >= startTime || now <= endTime;
        }
      default:
        return false;
    }
  }

  async blockWebsites(websites) {
    if (websites.length === 0) {
      // Only restore if we previously had modifications
      if (this.hostsIsModified) {
        await this.restoreHostsFile();
        this.hostsIsModified = false;
      }
      // Clear previous state if no websites to block
      if (this.previouslyBlockedWebsites.length > 0) {
        this.previouslyBlockedWebsites = [];
      }
      return;
    }

    // Check if the blocked websites have changed
    const websitesChanged = JSON.stringify(websites.sort()) !== JSON.stringify(this.previouslyBlockedWebsites.sort());

    try {
      // Read current hosts file
      const originalHosts = await fs.readFile(this.hostsPath, 'utf8');
      
      // Remove any existing blocking entries
      const lines = originalHosts.split('\n').filter(line => 
        !line.includes('# BLOCKED BY CLI')
      );

      // Add blocking entries
      const blockingEntries = [];
      websites.forEach(website => {
        try {
          const url = new URL(website);
          const hostname = url.hostname;
          const baseDomain = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
          
          blockingEntries.push(`127.0.0.1 ${baseDomain} # BLOCKED BY CLI`);
          blockingEntries.push(`127.0.0.1 www.${baseDomain} # BLOCKED BY CLI`);
        } catch (e) {
          // Fallback if not a valid URL
          blockingEntries.push(`127.0.0.1 ${website} # BLOCKED BY CLI`);
          blockingEntries.push(`127.0.0.1 www.${website} # BLOCKED BY CLI`);
        }
      });

      const newHosts = lines.join('\n') + '\n' + blockingEntries.join('\n');
      
      // Write modified hosts file
      await fs.writeFile(this.hostsPath, newHosts, 'utf8');
      
      // Flush DNS cache
      try {
        await execAsync('ipconfig /flushdns');
      } catch (dnsError) {
        console.warn('⚠️  DNS cache flush failed - websites may not be blocked immediately');
        console.warn(`   Error: ${dnsError.message}`);
      }
      
      // Mark that we have modified the hosts file
      this.hostsIsModified = true;
      
      // Only log if the blocked websites have changed
      if (websitesChanged) {
        console.log(`🚫 Blocked ${websites.length} website(s): ${websites.join(', ')}`);
        this.previouslyBlockedWebsites = [...websites];
      }
      
    } catch (error) {
      if (error.code === 'EPERM') {
        console.error('❌ Permission denied: Cannot modify hosts file');
        console.error('   Please ensure you are running as Administrator');
        this.displayAdminWarning();
      } else {
        console.error('❌ Failed to block websites:', error.message);
      }
    }
  }

  async blockApps(apps) {
    if (apps.length === 0) {
      // Clear previous state if no apps to block
      if (this.previouslyBlockedApps.length > 0) {
        this.previouslyBlockedApps = [];
      }
      return;
    }

    // Check if the blocked apps have changed
    const appsChanged = JSON.stringify(apps.sort()) !== JSON.stringify(this.previouslyBlockedApps.sort());

    // Only log if the blocked apps have changed
    if (appsChanged) {
      console.log(`🚫 Blocked ${apps.length} application(s): ${apps.join(', ')}`);
      this.previouslyBlockedApps = [...apps];
    }
    
    const blockedApps = [];
    for (const app of apps) {
      try {
        // Kill the process if it's running
        await execAsync(`taskkill /IM "${app}" /F`);
        blockedApps.push(app);
      } catch (error) {
        // Process might not be running, which is fine
        // Only log if it's not a "process not found" error
        if (!error.message.includes('not found') && !error.message.includes('not exist')) {
          console.error(`⚠️  Could not terminate ${app}: ${error.message}`);
        }
      }
    }
    if (blockedApps.length > 0) {
      console.log(`🚫 Terminated ${blockedApps.length} application(s): ${blockedApps.join(', ')}`);
    }
  }

  async createHostsBackup() {
    try {
      const dataDir = path.dirname(this.hostsBackupPath);
      await fs.mkdir(dataDir, { recursive: true });
      
      const hostsContent = await fs.readFile(this.hostsPath, 'utf8');
      await fs.writeFile(this.hostsBackupPath, hostsContent, 'utf8');
      console.log('✅ Created backup of original hosts file');
    } catch (error) {
      if (error.code === 'EPERM') {
        console.error('❌ Permission denied: Cannot read hosts file');
        this.displayAdminWarning();
        throw error;
      } else {
        console.error('❌ Failed to create hosts backup:', error.message);
        throw error;
      }
    }
  }

  async restoreHostsFile() {
    try {
      const backupExists = await fs.access(this.hostsBackupPath).then(() => true).catch(() => false);
      if (backupExists) {
        const backupContent = await fs.readFile(this.hostsBackupPath, 'utf8');
        await fs.writeFile(this.hostsPath, backupContent, 'utf8');
        try {
          await execAsync('ipconfig /flushdns');
        } catch (dnsError) {
          console.warn('⚠️  DNS cache flush failed during restoration - old entries may persist');
          console.warn(`   Error: ${dnsError.message}`);
        }
        console.log('✅ Hosts file restored to original state');
      } else {
        // If no backup, just remove our entries
        const currentHosts = await fs.readFile(this.hostsPath, 'utf8');
        const cleanedHosts = currentHosts.split('\n')
          .filter(line => !line.includes('# BLOCKED BY CLI'))
          .join('\n');
        await fs.writeFile(this.hostsPath, cleanedHosts, 'utf8');
        try {
          await execAsync('ipconfig /flushdns');
        } catch (dnsError) {
          console.warn('⚠️  DNS cache flush failed during cleanup - old entries may persist');
          console.warn(`   Error: ${dnsError.message}`);
        }
        console.log('✅ Removed blocking entries from hosts file');
      }
    } catch (error) {
      if (error.code === 'EPERM') {
        console.error('❌ Permission denied: Cannot restore hosts file');
        console.error('   Please ensure you are running as Administrator');
      } else {
        console.error('❌ Failed to restore hosts file:', error.message);
      }
    }
  }

  async loadConfig() {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      // Return default config if file doesn't exist
      return {
        schedules: []
      };
    }
  }

  async installService() {
    try {
      const appPath = path.resolve(__dirname, '../index.js');
      const taskName = 'BlockingNodeCLI';
      
      // Create a Windows Task Scheduler task
      const taskXml = `<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Blocking Node CLI Service</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>node</Command>
      <Arguments>"${appPath}" service --start</Arguments>
    </Exec>
  </Actions>
</Task>`.trim();

      // Save task XML to temp file
      const tempTaskFile = path.join(require('os').tmpdir(), 'blocking-task.xml');
      await fs.writeFile(tempTaskFile, taskXml, 'utf8');
      
      // Create the task
      await execAsync(`schtasks /create /tn "${taskName}" /xml "${tempTaskFile}" /f`);
      
      // Clean up temp file
      await fs.unlink(tempTaskFile);
      
      console.log('Service installed successfully');
    } catch (error) {
      console.error('Failed to install service:', error);
      throw error;
    }
  }

  async uninstallService() {
    try {
      const taskName = 'BlockingNodeCLI';
      await execAsync(`schtasks /delete /tn "${taskName}" /f`);
      console.log('Service uninstalled successfully');
    } catch (error) {
      console.error('Failed to uninstall service:', error);
      throw error;
    }
  }
}

module.exports = BlockingService;