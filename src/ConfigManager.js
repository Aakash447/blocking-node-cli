const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, '../data/config.json');
    this.dataDir = path.join(__dirname, '../data');
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async getConfig() {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      // Return default config if file doesn't exist
      const defaultConfig = {
        version: '1.0.0',
        schedules: [],
        settings: {
          checkInterval: 3000, // 3 seconds
          logLevel: 'info',
          autoStart: false,
          enabledByDefault: true
        },
        lastUpdate: new Date().toISOString()
      };
      
      await this.saveConfig(defaultConfig);
      return defaultConfig;
    }
  }

  async saveConfig(config) {
    await this.ensureDataDir();
    config.lastUpdate = new Date().toISOString();
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  async updateSettings(newSettings) {
    const config = await this.getConfig();
    config.settings = { ...config.settings, ...newSettings };
    await this.saveConfig(config);
    return config.settings;
  }

  async getSetting(key) {
    const config = await this.getConfig();
    return config.settings[key];
  }

  async setSetting(key, value) {
    const config = await this.getConfig();
    config.settings[key] = value;
    await this.saveConfig(config);
  }

  async exportConfig() {
    const config = await this.getConfig();
    const exportData = {
      ...config,
      exportDate: new Date().toISOString(),
      exportedBy: 'blocking-node-cli'
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importConfig(configData) {
    try {
      const importedConfig = JSON.parse(configData);
      
      // Validate imported config structure
      if (!importedConfig.schedules || !Array.isArray(importedConfig.schedules)) {
        throw new Error('Invalid config format: missing or invalid schedules array');
      }

      // Merge with current config
      const currentConfig = await this.getConfig();
      const mergedConfig = {
        ...currentConfig,
        schedules: importedConfig.schedules,
        settings: { ...currentConfig.settings, ...(importedConfig.settings || {}) }
      };

      await this.saveConfig(mergedConfig);
      return mergedConfig;
    } catch (error) {
      throw new Error(`Failed to import config: ${error.message}`);
    }
  }

  async resetConfig() {
    const defaultConfig = {
      version: '1.0.0',
      schedules: [],
      settings: {
        checkInterval: 3000,
        logLevel: 'info',
        autoStart: false,
        enabledByDefault: true
      }
    };
    
    await this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  async getScheduleStats() {
    const config = await this.getConfig();
    const stats = {
      totalSchedules: config.schedules.length,
      enabledSchedules: config.schedules.filter(s => s.enabled).length,
      totalWebsites: 0,
      totalKeywords: 0,
      totalApps: 0,
      schedulesByType: {
        time: 0,
        alltime: 0,
        morning: 0
      }
    };

    config.schedules.forEach(schedule => {
      stats.totalWebsites += schedule.websites ? schedule.websites.length : 0;
      stats.totalKeywords += schedule.keywords ? schedule.keywords.length : 0;
      stats.totalApps += schedule.apps ? schedule.apps.length : 0;
      
      if (stats.schedulesByType.hasOwnProperty(schedule.type)) {
        stats.schedulesByType[schedule.type]++;
      }
    });

    return stats;
  }
}

module.exports = ConfigManager;