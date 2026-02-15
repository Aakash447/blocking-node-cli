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
      // Test 1: Try to write a test file to a system directory
      const testPath = 'C:\\Windows\\Temp\\admin_test.txt';
      await fs.writeFile(testPath, 'test', 'utf8');
      await fs.unlink(testPath);
      
      // Test 2: Verify we can actually run netsh commands (critical for proxy config)
      try {
        await execAsync('netsh winhttp show proxy');
        return true;
      } catch (netshError) {
        console.warn('⚠️  Warning: netsh command access denied - may need full administrator rights');
        return false;
      }
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
      
      // Show browser configuration instructions
      this.showBrowserSetupInstructions();
      
      // Start traffic monitoring to warn if no requests detected
      this.startTrafficMonitoring();
      
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
    // Load check interval from config
    const config = await this.loadConfig();
    const checkInterval = config.settings?.checkInterval || 10000;
    
    console.log(`⏱️  Monitoring interval: ${checkInterval}ms (checks every ${checkInterval/1000} seconds)`);
    
    let cycleCount = 0;
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
        
        cycleCount++;
        
        // Print stats every 20 cycles (approximately every 3-5 minutes)
        if (cycleCount % 20 === 0) {
          console.log(`\n${'═'.repeat(70)}`);
          console.log(`⏰ [${new Date().toLocaleTimeString()}] Monitoring Status - Cycle: ${cycleCount}`);
          if (this.proxyServer && this.proxyIsRunning) {
            this.proxyServer.printStats();
          }
          console.log(`${'═'.repeat(70)}\n`);
        }
        
        await this.enforceBlocking(false); // Not verbose during monitoring
      } catch (error) {
        console.error('Error during monitoring:', error);
      }
    }, checkInterval);

    // Initial enforcement (verbose)
    console.log('\n🚀 Starting initial blocking enforcement...');
    await this.enforceBlocking(true);
  }

  async enforceBlocking(verbose = false) {
    const config = await this.loadConfig();
    const currentTime = new Date();
    
    // Check which schedules are active
    const activeSchedules = config.schedules.filter(schedule => 
      this.isScheduleActive(schedule, currentTime)
    );

    if (verbose) {
      console.log(`\n📋 Active schedules: ${activeSchedules.length} of ${config.schedules.length}`);
      activeSchedules.forEach(s => {
        console.log(`   ✓ ${s.name} (${s.type})`);
      });
    }

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

    if (verbose) {
      console.log(`\n🎯 Blocking targets:`);
      console.log(`   Websites: ${websitesToBlock.length ? websitesToBlock.join(', ') : 'none'}`);
      console.log(`   Keywords: ${keywordsToBlock.length ? keywordsToBlock.join(', ') : 'none'}`);
      console.log(`   Apps: ${appsToBlock.length ? appsToBlock.join(', ') : 'none'}`);
    }

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
    // Try netsh winhttp first (preferred method)
    try {
      await execAsync('netsh winhttp set proxy proxy-server="http=127.0.0.1:3128;https=127.0.0.1:3128" bypass-list="localhost"');
      console.log('✅ System proxy configured via netsh');
      return true;
    } catch (error) {
      console.warn('⚠️  netsh command failed, trying registry-based method...');
    }

    // Fallback: Try setting Internet Explorer proxy via registry (works for many apps)
    try {
      const regCommands = [
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:3128" /f',
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "localhost;127.*;10.*;172.16.*;172.31.*;192.168.*" /f'
      ];
      
      for (const cmd of regCommands) {
        await execAsync(cmd);
      }
      
      console.log('✅ System proxy configured via registry (IE/Edge compatible)');
      console.log('🌐 Note: Some apps may require manual proxy configuration');
      return true;
    } catch (regError) {
      console.error('❌ Failed to configure system proxy via registry:', regError.message);
      this.showProxyConfigHelp();
      return false;
    }
  }

  showProxyConfigHelp() {
    console.log('\n' + '━'.repeat(60));
    console.log('⚠️  PROXY CONFIGURATION FAILED');
    console.log('━'.repeat(60));
    console.log('The service is running but couldn\'t configure system proxy.');
    console.log('\nPOSSIBLE SOLUTIONS:');
    console.log('\n1. Run as TRUE Administrator:');
    console.log('   • Right-click Command Prompt or PowerShell');
    console.log('   • Select "Run as administrator"');
    console.log('   • Navigate to this folder and try again');
    console.log('\n2. Manually configure proxy in Windows Settings:');
    console.log('   • Open: Settings > Network & Internet > Proxy');
    console.log('   • Enable: "Use a proxy server"');
    console.log('   • Address: 127.0.0.1');
    console.log('   • Port: 3128');
    console.log('   • Don\'t use proxy for: localhost');
    console.log('\n3. Configure browser-specific proxy:');
    console.log('   • Chrome: Settings > System > Open proxy settings');
    console.log('   • Firefox: Settings > Network Settings > Manual proxy');
    console.log('\n4. Check Windows permissions:');
    console.log('   • Type in Command Prompt: net session');
    console.log('   • Should show "Access is denied" if not admin');
    console.log('━'.repeat(60) + '\n');
  }

  showBrowserSetupInstructions() {
    console.log('\n' + '═'.repeat(70));
    console.log('🌐 IMPORTANT: CONFIGURE YOUR BROWSER TO USE THE PROXY');
    console.log('═'.repeat(70));
    console.log('\nThe proxy is running, but browsers need manual configuration:');
    console.log('\n📱 CHROME / EDGE / BRAVE:');
    console.log('   1. Open: Settings → System → "Open your computer\'s proxy settings"');
    console.log('   2. Enable: "Use a proxy server"');
    console.log('   3. Address: 127.0.0.1  |  Port: 3128');
    console.log('   4. Add to bypass list: localhost;127.*;192.168.*');
    console.log('   5. Save and restart browser');
    console.log('\n🦊 FIREFOX:');
    console.log('   1. Open: Settings → Network Settings → Settings button');
    console.log('   2. Select: "Manual proxy configuration"');
    console.log('   3. HTTP Proxy: 127.0.0.1  |  Port: 3128');
    console.log('   4. HTTPS Proxy: 127.0.0.1  |  Port: 3128');
    console.log('   5. Check: "Use this proxy server for all protocols"');
    console.log('   6. Add to "No proxy for": localhost, 127.0.0.1');
    console.log('   7. Click OK (no restart needed)');
    console.log('\n🚀 QUICK TEST:');
    console.log('   After configuration, visit any website.');
    console.log('   You should see logs appear below showing the connection.');
    console.log('\n💡 TIP: If you don\'t see logs, the proxy isn\'t configured correctly!');
    console.log('═'.repeat(70) + '\n');
  }

  startTrafficMonitoring() {
    // Check if proxy is receiving traffic after 30 seconds
    setTimeout(() => {
      if (this.proxyServer && this.proxyIsRunning) {
        const stats = this.proxyServer.getStats();
        if (stats.totalRequests === 0) {
          console.log('\n' + '⚠'.repeat(70));
          console.log('⚠️  WARNING: NO TRAFFIC DETECTED AFTER 30 SECONDS!');
          console.log('⚠'.repeat(70));
          console.log('\nThe proxy server is running but hasn\'t received any requests.');
          console.log('This means your browser is NOT configured to use the proxy.');
          console.log('\n🔧 TROUBLESHOOTING:');
          console.log('   1. Did you configure your browser proxy settings?');
          console.log('      → Chrome/Edge: Settings → System → Open proxy settings');
          console.log('      → Firefox: Settings → Network Settings → Manual proxy');
          console.log('   2. Set proxy to: 127.0.0.1:3128');
          console.log('   3. Save settings and RESTART your browser');
          console.log('   4. Try visiting any website');
          console.log('   5. Watch for logs to appear in this window');
          console.log('\n📖 For detailed instructions, check the documentation.');
          console.log('⚠'.repeat(70) + '\n');
        } else {
          console.log('\n✅ Traffic detected! Proxy is working correctly.');
          console.log(`   Total requests processed: ${stats.totalRequests}`);
          console.log(`   Blocked: ${stats.blockedRequests} | Allowed: ${stats.allowedRequests}\n`);
        }
      }
    }, 30000); // 30 seconds
  }

  async disableSystemProxy() {
    // Try netsh winhttp reset first
    try {
      await execAsync('netsh winhttp reset proxy');
      console.log('✅ System proxy reset via netsh');
    } catch (error) {
      console.warn('⚠️  netsh reset failed, trying registry method...');
    }

    // Also try to disable IE/Edge proxy via registry (fallback)
    try {
      await execAsync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f');
      console.log('✅ System proxy reset via registry');
    } catch (regError) {
      console.error('❌ Failed to reset system proxy:', regError.message);
      console.log('⚠️  You may need to manually disable proxy in Windows Settings');
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