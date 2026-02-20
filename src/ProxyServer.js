const http = require('http');
const net = require('net');
const { URL } = require('url');

class ProxyServer {
  constructor(port = 3128) {
    this.port = port;
    this.server = null;
    this.isRunning = false;
    
    // Blocked lists
    this.blockedWebsites = [];
    this.blockedKeywords = [];
    
    // State tracking for logging
    this.previouslyBlockedWebsites = [];
    this.previouslyBlockedKeywords = [];
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
        console.log(`🌐 Proxy server running on 127.0.0.1:${this.port}`);
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
   * Handle HTTP requests
   */
  handleHttpRequest(req, res) {
    const fullUrl = req.url;
    
    // Check if blocked
    const blockResult = this.isBlocked(fullUrl);
    if (blockResult.blocked) {
      console.log(`🚫 Blocked HTTP request: ${fullUrl} (${blockResult.reason})`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Blocked by Blocking Node CLI',
        reason: blockResult.reason,
        url: fullUrl
      }));
      return;
    }

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
    
    // Check if blocked
    const blockResult = this.isBlocked(hostname);
    if (blockResult.blocked) {
      console.log(`🚫 Blocked HTTPS CONNECT: ${hostname}:${port} (${blockResult.reason})`);
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.end();
      return;
    }

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
}

module.exports = ProxyServer;
