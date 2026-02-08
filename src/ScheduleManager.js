const fs = require('fs').promises;
const path = require('path');

class ScheduleManager {
  constructor(blockingService) {
    this.blockingService = blockingService;
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

  async saveConfig(config) {
    await this.ensureDataDir();
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  async createSchedule(name, options) {
    const config = await this.loadConfig();
    
    // Check if schedule already exists
    const existingSchedule = config.schedules.find(s => s.name === name);
    if (existingSchedule) {
      throw new Error(`Schedule "${name}" already exists`);
    }

    // Validate time format (whenever times are explicitly provided, regardless of type)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    const startTime = options.start || '00:00';
    const endTime = options.end || '23:59';
    
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      throw new Error('Time must be in HH:MM format (24-hour)');
    }

    const newSchedule = {
      name,
      type: options.type, // 'time', 'alltime', 'morning'
      start: startTime,
      end: endTime,
      websites: [],
      apps: [],
      enabled: true,
      created: new Date().toISOString()
    };

    config.schedules.push(newSchedule);
    await this.saveConfig(config);
    
    return newSchedule;
  }

  async listSchedules() {
    const config = await this.loadConfig();
    return config.schedules;
  }

  async deleteSchedule(name) {
    const config = await this.loadConfig();
    const scheduleIndex = config.schedules.findIndex(s => s.name === name);
    
    if (scheduleIndex === -1) {
      throw new Error(`Schedule "${name}" not found`);
    }

    config.schedules.splice(scheduleIndex, 1);
    await this.saveConfig(config);
  }

  normalizeWebsite(item) {
    // If it already has a protocol, parse it
    let url;
    try {
      url = new URL(item);
    } catch (e) {
      // Not a valid URL, assume it's a domain
      url = new URL('https://' + item);
    }
    
    // Get the hostname
    let hostname = url.hostname;
    
    // If hostname doesn't start with www., add it
    if (!hostname.startsWith('www.')) {
      hostname = 'www.' + hostname;
    }
    
    // Return the full URL with https
    return 'https://' + hostname;
  }

  async addItemToSchedule(scheduleName, item, type) {
    const config = await this.loadConfig();
    const schedule = config.schedules.find(s => s.name === scheduleName);
    
    if (!schedule) {
      throw new Error(`Schedule "${scheduleName}" not found`);
    }

    if (type === 'website') {
      // Normalize the website URL
      const normalizedItem = this.normalizeWebsite(item);
      
      // Validate domain format after normalization
      const url = new URL(normalizedItem);
      const domainRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!domainRegex.test(url.hostname)) {
        throw new Error('Invalid domain format');
      }
      
      if (!schedule.websites.includes(normalizedItem)) {
        schedule.websites.push(normalizedItem);
      }
    } else if (type === 'app') {
      // Add .exe extension if not present
      const appName = item.endsWith('.exe') ? item : item + '.exe';
      if (!schedule.apps.includes(appName)) {
        schedule.apps.push(appName);
      }
    } else {
      throw new Error('Type must be either "website" or "app"');
    }

    await this.saveConfig(config);
  }

  async removeItemFromSchedule(scheduleName, item) {
    const config = await this.loadConfig();
    const schedule = config.schedules.find(s => s.name === scheduleName);
    
    if (!schedule) {
      throw new Error(`Schedule "${scheduleName}" not found`);
    }

    // Remove from websites
    const normalizedItem = this.normalizeWebsite(item);
    const websiteIndex = schedule.websites.indexOf(normalizedItem);
    if (websiteIndex > -1) {
      schedule.websites.splice(websiteIndex, 1);
    }

    // Remove from apps (try both with and without .exe)
    const appIndex = schedule.apps.indexOf(item);
    const appWithExeIndex = schedule.apps.indexOf(item + '.exe');
    const appWithoutExeIndex = schedule.apps.indexOf(item.replace('.exe', ''));
    
    if (appIndex > -1) {
      schedule.apps.splice(appIndex, 1);
    } else if (appWithExeIndex > -1) {
      schedule.apps.splice(appWithExeIndex, 1);
    } else if (appWithoutExeIndex > -1) {
      schedule.apps.splice(appWithoutExeIndex, 1);
    }

    await this.saveConfig(config);
  }

  async getSchedule(name) {
    const config = await this.loadConfig();
    return config.schedules.find(s => s.name === name);
  }

  async toggleSchedule(name, enabled) {
    const config = await this.loadConfig();
    const schedule = config.schedules.find(s => s.name === name);
    
    if (!schedule) {
      throw new Error(`Schedule "${name}" not found`);
    }

    schedule.enabled = enabled;
    await this.saveConfig(config);
  }

  async updateScheduleTime(name, start, end) {
    const config = await this.loadConfig();
    const schedule = config.schedules.find(s => s.name === name);
    
    if (!schedule) {
      throw new Error(`Schedule "${name}" not found`);
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      throw new Error('Time must be in HH:MM format (24-hour)');
    }

    schedule.start = start;
    schedule.end = end;
    await this.saveConfig(config);
  }
}

module.exports = ScheduleManager;