const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const ProxyServer = require('./ProxyServer');

class BlockingService {
  constructor() {
    this.isRunning = false;
    this.monitoringInterval = null;
    this.configPath = path.join(__dirname, '../data/config.json');
    this.previouslyBlockedApps = [];
    this.pidFilePath = path.join(__dirname, '../data/service.pid');
    this.stopFilePath = path.join(__dirname, '../data/stop.signal');
    this.proxyServer = new ProxyServer(3128);
    this.proxyIsRunning = false;
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
    console.log('• Configure Windows system proxy');
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

      // Configure Windows system proxy
      await this.enableSystemProxy();
      
      // Start proxy server
      await this.proxyServer.start();
      this.proxyIsRunning = true;
      
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

      // Stop proxy server
      if (this.proxyIsRunning) {
        await this.proxyServer.stop();
        this.proxyIsRunning = false;
      }

      // Reset Windows system proxy
      await this.disableSystemProxy();

      // Clear previous blocking state
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

    // Collect all websites, keywords, and apps to block
    let websitesToBlock = [];
    let keywordsToBlock = [];
    let appsToBlock = [];

    activeSchedules.forEach(schedule => {
      websitesToBlock = [...websitesToBlock, ...(schedule.websites || [])];
      keywordsToBlock = [...keywordsToBlock, ...(schedule.keywords || [])];
      appsToBlock = [...appsToBlock, ...(schedule.apps || [])];
    });

    // Remove duplicates
    websitesToBlock = [...new Set(websitesToBlock)];
    keywordsToBlock = [...new Set(keywordsToBlock)];
    appsToBlock = [...new Set(appsToBlock)];

    // Update proxy server with blocked lists
    if (this.proxyIsRunning) {
      this.proxyServer.updateBlockedLists(websitesToBlock, keywordsToBlock);
    }

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

  async enableSystemProxy() {
    try {
      await execAsync('netsh winhttp set proxy proxy-server="http=127.0.0.1:3128;https=127.0.0.1:3128" bypass-list="localhost"');
      console.log('✅ System proxy configured');
    } catch (error) {
      console.error('❌ Failed to configure system proxy:', error.message);
      console.warn('⚠️  Proxy server will start but system proxy is not configured');
      console.warn('   You may need to manually configure proxy settings');
    }
  }

  async disableSystemProxy() {
    try {
      await execAsync('netsh winhttp reset proxy');
      console.log('✅ System proxy reset');
    } catch (error) {
      console.error('❌ Failed to reset system proxy:', error.message);
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