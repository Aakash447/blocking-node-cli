const http = require('http');
const net = require('net');
const { URL } = require('url');

class ProxyServer {
  constructor(port = 3128, debug = true) {
    this.port = port;
    this.server = null;
    this.isRunning = false;
    this.debug = debug;
    
    // Track active connections for forced shutdown
    this.activeConnections = new Set();
    
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
      uniqueHosts: new Set(),
      errorCount: 0,
      lastErrors: [] // Track last 5 errors
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

      // Fix for Windows PowerShell buffering - force synchronous output
      if (process.platform === 'win32' && process.stdout._handle) {
        process.stdout._handle.setBlocking(true);
        if (process.stderr._handle) {
          process.stderr._handle.setBlocking(true);
        }
      }

      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Track connections for forced shutdown
      this.server.on('connection', (socket) => {
        this.activeConnections.add(socket);
        socket.on('close', () => {
          this.activeConnections.delete(socket);
        });
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
        console.log(`\n💡 Logging: Blocked requests shown in detail, allowed requests shown once per minute`);
        console.log(`   (compact format to avoid spam from ads/trackers)`);
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

      // Immediately stop accepting new connections
      this.isRunning = false;

      // Force destroy all active connections
      for (const socket of this.activeConnections) {
        socket.destroy();
      }
      this.activeConnections.clear();

      // Close the server (should be immediate now)
      this.server.close(() => {
        this.server = null;
        console.log('🛑 Proxy server stopped');
        resolve();
      });

      // Fallback: If server.close doesn't call callback within 2 seconds, force resolve
      setTimeout(() => {
        if (this.server) {
          this.server = null;
        }
        resolve();
      }, 2000);
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
    
    // Parse hostname from request
    let hostname;
    let targetPath;
    let targetPort = 80;
    
    // HTTP proxy requests come in two formats:
    // 1. Full URL: http://example.com/path
    // 2. Relative path with Host header: /path (with Host: example.com)
    if (fullUrl.startsWith('http://')) {
      try {
        const url = new URL(fullUrl);
        hostname = url.hostname;
        targetPath = url.pathname + url.search;
        targetPort = url.port || 80;
      } catch (error) {
        console.error(`❌ Invalid URL: ${fullUrl}`);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: Invalid URL');
        return;
      }
    } else {
      // Use Host header
      hostname = req.headers.host;
      if (!hostname) {
        console.error('❌ No Host header in request');
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: No Host header');
        return;
      }
      
      // Handle port in Host header
      if (hostname.includes(':')) {
        const [host, port] = hostname.split(':');
        hostname = host;
        targetPort = parseInt(port, 10);
      }
      
      targetPath = fullUrl;
    }
    
    this.stats.totalRequests++;
    this.stats.httpRequests++;
    this.stats.uniqueHosts.add(hostname);
    
    // Check if blocked
    const blockResult = this.isBlocked(hostname);
    
    // Log based on result
    if (blockResult.blocked) {
      // Always show detailed logs for blocked requests
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`📡 [${timestamp}] HTTP Request - 🚫 BLOCKED`);
      console.log(`   Hostname: ${hostname}`);
      console.log(`   Reason: ${blockResult.reason}`);
      console.log(`   Method: ${req.method}`);
      console.log(`   From: ${req.socket.remoteAddress}`);
      console.log(`${'─'.repeat(70)}`);
    } else if (this.shouldLogHostname(hostname)) {
      // Compact one-line format for allowed requests
      const timestamp = new Date().toLocaleTimeString();
      console.log(`✅ [${timestamp}] HTTP ${hostname}`);
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
          <p><strong>${hostname}</strong></p>
          <p>Reason: ${blockResult.reason}</p>
          <p><small>Blocked by Blocking Node CLI</small></p>
        </body>
        </html>
      `);
      return;
    }
    
    this.stats.allowedRequests++;

    // Forward the request properly
    const options = {
      hostname: hostname,
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers: { ...req.headers }
    };
    
    // Remove proxy-specific headers
    delete options.headers['proxy-connection'];

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      // Track errors
      this.stats.errorCount++;
      this.stats.lastErrors.push({
        hostname: hostname,
        error: err.message,
        code: err.code,
        timestamp: new Date().toLocaleTimeString()
      });
      // Keep only last 5 errors
      if (this.stats.lastErrors.length > 5) {
        this.stats.lastErrors.shift();
      }
      
      // Suppress noise for common connection errors
      const normalErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
      if (!normalErrors.includes(err.code)) {
        console.error(`❌ Proxy request error for ${hostname}: ${err.message}`);
      }
      
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Connection Error</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>⚠️ Connection Failed</h1>
          <p>Could not connect to <strong>${hostname}</strong></p>
          <p>Error: ${err.message}</p>
          <p><small>This is a network error, not a block.</small></p>
        </body>
        </html>
      `);
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
    
    // Log based on result
    if (blockResult.blocked) {
      // Always show detailed logs for blocked requests
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🔒 [${timestamp}] HTTPS Request - 🚫 BLOCKED`);
      console.log(`   Hostname: ${hostname}`);
      console.log(`   Reason: ${blockResult.reason}`);
      console.log(`   Port: ${port}`);
      console.log(`   From: ${clientSocket.remoteAddress}`);
      console.log(`${'─'.repeat(70)}`);
    } else if (this.shouldLogHostname(hostname)) {
      // Compact one-line format for allowed requests
      const timestamp = new Date().toLocaleTimeString();
      console.log(`✅ [${timestamp}] HTTPS ${hostname}`);
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

    // Track if connection was established to differentiate real errors from cleanup
    let connectionEstablished = false;
    serverSocket.once('connect', () => {
      connectionEstablished = true;
    });

    serverSocket.on('error', (err) => {
      // Suppress expected errors during connection teardown
      const normalErrors = ['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT'];
      if (!normalErrors.includes(err.code) && connectionEstablished) {
        console.error(`❌ Tunnel error for ${hostname}: ${err.message}`);
      }
      if (!clientSocket.destroyed) {
        clientSocket.destroy();
      }
    });

    clientSocket.on('error', (err) => {
      // Suppress expected errors during connection teardown
      const normalErrors = ['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT'];
      if (!normalErrors.includes(err.code) && connectionEstablished) {
        console.error(`❌ Client socket error for ${hostname}: ${err.message}`);
      }
      if (!serverSocket.destroyed) {
        serverSocket.destroy();
      }
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
    console.log(`      Errors: ${this.stats.errorCount} ⚠️`);
    
    if (this.stats.lastErrors.length > 0) {
      console.log('      Recent errors:');
      this.stats.lastErrors.forEach(err => {
        console.log(`        • [${err.timestamp}] ${err.hostname}: ${err.error} (${err.code || 'unknown'})`);
      });
    }
    
    if (this.stats.totalRequests === 0) {
      console.log(`      ⚠️  No traffic detected - check browser proxy settings!`);
    } else if (this.stats.errorCount > this.stats.allowedRequests * 0.5) {
      console.log(`      ⚠️  WARNING: High error rate! Check your internet connection.`);
      console.log(`      ⚠️  If legitimate sites break, try: node index.js flush-dns`);
    }
  }
}

module.exports = ProxyServer;
