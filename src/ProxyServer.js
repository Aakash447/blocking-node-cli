const http = require('http');
const net = require('net');
const { URL } = require('url');

class ProxyServer {
  constructor(port = 3128, debug = true) {
    this.port = port;
    this.server = null;
    this.isRunning = false;
    this.debug = debug;
    
    // Blocked lists
    this.blockedWebsites = [];
    this.blockedKeywords = [];
    
    // State tracking for logging
    this.previouslyBlockedWebsites = [];
    this.previouslyBlockedKeywords = [];
    
    // Request deduplication - track logged hostnames
    this.loggedHostnames = new Map(); // hostname -> timestamp
    this.logThrottleTime = 60000; // Only log same hostname once per 60 seconds
    
    // Debug statistics
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      httpRequests: 0,
      httpsRequests: 0,
      uniqueHosts: new Set()
    };
  }

  /**
   * Start the proxy server
   */
  start() {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        return resolve();
      }

      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Handle HTTPS CONNECT tunneling
      this.server.on('connect', (req, clientSocket, head) => {
        this.handleConnectRequest(req, clientSocket, head);
      });

      this.server.on('error', (err) => {
        console.error('❌ Proxy server error:', err.message);
        reject(err);
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true;
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🌐 Proxy server ACTIVE on 127.0.0.1:${this.port}`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`Waiting for connections...`);
        console.log(`\n💡 Note: Each website is logged only once per minute`);
        console.log(`   (to avoid spam from ads/trackers)`);
        console.log(`\nAll traffic will be logged below:\n`);
        resolve();
      });
    });
  }

  /**
   * Stop the proxy server
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.isRunning || !this.server) {
        return resolve();
      }

      this.server.close(() => {
        this.isRunning = false;
        this.server = null;
        console.log('🛑 Proxy server stopped');
        resolve();
      });

      // Force close all connections
      this.server.closeAllConnections?.();
    });
  }

  /**
   * Update the blocked lists
   * @param {string[]} websites - Array of hostnames to block
   * @param {string[]} keywords - Array of keywords to block in URLs
   */
  updateBlockedLists(websites, keywords) {
    // Normalize websites (lowercase, remove protocol/path)
    this.blockedWebsites = websites.map(site => {
      try {
        const url = new URL(site.includes('://') ? site : `https://${site}`);
        return url.hostname.toLowerCase();
      } catch {
        return site.toLowerCase();
      }
    });

    // Normalize keywords (lowercase, trim)
    this.blockedKeywords = keywords.map(kw => kw.toLowerCase().trim());

    // Log changes
    this.logBlockedChanges();
  }

  /**
   * Log changes in blocked lists (avoid spam)
   */
  logBlockedChanges() {
    const websitesChanged = JSON.stringify(this.blockedWebsites.sort()) !== 
                           JSON.stringify(this.previouslyBlockedWebsites.sort());
    const keywordsChanged = JSON.stringify(this.blockedKeywords.sort()) !== 
                           JSON.stringify(this.previouslyBlockedKeywords.sort());

    if (websitesChanged) {
      if (this.blockedWebsites.length > 0) {
        console.log('🚫 Blocking websites:', this.blockedWebsites.join(', '));
      } else {
        console.log('✅ No websites blocked');
      }
      this.previouslyBlockedWebsites = [...this.blockedWebsites];
    }

    if (keywordsChanged) {
      if (this.blockedKeywords.length > 0) {
        console.log('🔍 Blocking keywords:', this.blockedKeywords.join(', '));
      } else {
        console.log('✅ No keywords blocked');
      }
      this.previouslyBlockedKeywords = [...this.blockedKeywords];
    }
  }

  /**
   * Check if a URL should be blocked
   * @param {string} urlString - Full URL or hostname
   * @returns {{blocked: boolean, reason: string|null}}
   */
  isBlocked(urlString) {
    const lowerUrl = urlString.toLowerCase();
    
    // Extract hostname
    let hostname;
    try {
      const url = new URL(urlString.includes('://') ? urlString : `http://${urlString}`);
      hostname = url.hostname.toLowerCase();
    } catch {
      hostname = urlString.toLowerCase();
    }

    // Check blocked websites (exact match or subdomain match)
    for (const blockedSite of this.blockedWebsites) {
      if (hostname === blockedSite || hostname.endsWith(`.${blockedSite}`)) {
        return { blocked: true, reason: `website: ${blockedSite}` };
      }
    }

    // Check blocked keywords (substring match in full URL)
    for (const keyword of this.blockedKeywords) {
      if (lowerUrl.includes(keyword)) {
        return { blocked: true, reason: `keyword: ${keyword}` };
      }
    }

    return { blocked: false, reason: null };
  }

  /**
   * Check if we should log this hostname (deduplication)
   * @param {string} hostname - Hostname to check
   * @returns {boolean} - True if should log, false if recently logged
   */
  shouldLogHostname(hostname) {
    const now = Date.now();
    const lastLogged = this.loggedHostnames.get(hostname);
    
    // Clean up old entries (older than throttle time)
    for (const [host, timestamp] of this.loggedHostnames.entries()) {
      if (now - timestamp > this.logThrottleTime) {
        this.loggedHostnames.delete(host);
      }
    }
    
    // Check if we logged this hostname recently
    if (lastLogged && (now - lastLogged) < this.logThrottleTime) {
      return false; // Skip logging
    }
    
    // Update timestamp and allow logging
    this.loggedHostnames.set(hostname, now);
    return true;
  }

  /**
   * Extract hostname from URL
   * @param {string} urlString - URL or hostname
   * @returns {string} - Extracted hostname
   */
  extractHostname(urlString) {
    try {
      const url = new URL(urlString.includes('://') ? urlString : `http://${urlString}`);
      return url.hostname.toLowerCase();
    } catch {
      return urlString.toLowerCase();
    }
  }

  /**
   * Handle HTTP requests
   */
  handleHttpRequest(req, res) {
    const fullUrl = req.url;
    const hostname = this.extractHostname(fullUrl);
    
    this.stats.totalRequests++;
    this.stats.httpRequests++;
    this.stats.uniqueHosts.add(hostname);
    
    // Check if blocked
    const blockResult = this.isBlocked(fullUrl);
    
    // Always log blocked requests, but throttle allowed requests
    const shouldLog = blockResult.blocked || this.shouldLogHostname(hostname);
    
    if (shouldLog) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`📡 [${timestamp}] HTTP Request`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Hostname: ${hostname}`);
      console.log(`   From: ${req.socket.remoteAddress}`);
      
      if (blockResult.blocked) {
        console.log(`   Result: 🚫 BLOCKED (${blockResult.reason})`);
      } else {
        console.log(`   Result: ✅ ALLOWED`);
      }
      console.log(`${'─'.repeat(70)}`);
    }
    
    if (blockResult.blocked) {
      this.stats.blockedRequests++;
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Blocked</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>🚫 Site Blocked</h1>
          <p><strong>${fullUrl}</strong></p>
          <p>Reason: ${blockResult.reason}</p>
          <p><small>Blocked by Blocking Node CLI</small></p>
        </body>
        </html>
      `);
      return;
    }
    
    this.stats.allowedRequests++;

    // Forward the request
    const options = {
      hostname: req.headers.host,
      port: 80,
      path: req.url,
      method: req.method,
      headers: req.headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`❌ Proxy request error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    });

    req.pipe(proxyReq);
  }

  /**
   * Handle HTTPS CONNECT requests (tunneling)
   */
  handleConnectRequest(req, clientSocket, head) {
    const { port, hostname } = this.parseConnectRequest(req.url);
    
    this.stats.totalRequests++;
    this.stats.httpsRequests++;
    this.stats.uniqueHosts.add(hostname);
    
    // Check if blocked
    const blockResult = this.isBlocked(hostname);
    
    // Always log blocked requests, but throttle allowed requests
    const shouldLog = blockResult.blocked || this.shouldLogHostname(hostname);
    
    if (shouldLog) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🔒 [${timestamp}] HTTPS Request`);
      console.log(`   Method: CONNECT`);
      console.log(`   Hostname: ${hostname}`);
      console.log(`   Port: ${port}`);
      console.log(`   From: ${clientSocket.remoteAddress}`);
      
      if (blockResult.blocked) {
        console.log(`   Result: 🚫 BLOCKED (${blockResult.reason})`);
      } else {
        console.log(`   Result: ✅ ALLOWED`);
      }
      console.log(`${'─'.repeat(70)}`);
    }
    
    if (blockResult.blocked) {
      this.stats.blockedRequests++;
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.end();
      return;
    }
    
    this.stats.allowedRequests++;

    // Create tunnel to destination
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', (err) => {
      console.error(`❌ Tunnel error for ${hostname}: ${err.message}`);
      clientSocket.end();
    });

    clientSocket.on('error', (err) => {
      console.error(`❌ Client socket error: ${err.message}`);
      serverSocket.end();
    });
  }

  /**
   * Parse CONNECT request URL
   * @param {string} url - Format: "hostname:port"
   * @returns {{hostname: string, port: number}}
   */
  parseConnectRequest(url) {
    const [hostname, portStr] = url.split(':');
    const port = parseInt(portStr, 10) || 443;
    return { hostname, port };
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Print statistics
   */
  printStats() {
    console.log('   📊 Proxy Server Statistics:');
    console.log(`      Total requests: ${this.stats.totalRequests}`);
    console.log(`      Unique websites: ${this.stats.uniqueHosts.size}`);
    console.log(`      ├─ HTTP: ${this.stats.httpRequests}`);
    console.log(`      └─ HTTPS: ${this.stats.httpsRequests}`);
    console.log(`      Blocked: ${this.stats.blockedRequests} 🚫`);
    console.log(`      Allowed: ${this.stats.allowedRequests} ✅`);
    
    if (this.stats.totalRequests === 0) {
      console.log(`      ⚠️  No traffic detected - check browser proxy settings!`);
    }
  }
}

module.exports = ProxyServer;
