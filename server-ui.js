const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = process.env.UI_HOST || '0.0.0.0';
const DISPLAY_HOST = process.env.UI_DISPLAY_HOST || 'localhost';
const PORT = Number(process.env.UI_PORT || 5500);
const ROOT_DIR = path.resolve(__dirname);
const INDEX_FILE = path.join(ROOT_DIR, 'index.html');
const API_HOST = process.env.API_PROXY_HOST || '127.0.0.1';
const API_PORT = Number(process.env.PORT || process.env.API_PROXY_PORT || 4000);

const MIME_TYPES = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'");
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let contentType = MIME_TYPES[ext] || 'application/octet-stream';
  if (/^(text\/|application\/json|image\/svg\+xml)/.test(contentType)) {
    contentType += '; charset=utf-8';
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    const headers = { 'Content-Type': contentType };
    // The portal UI contains the incident edit/save behaviour. Revalidate the
    // browser assets so a user cannot continue submitting an outdated payload.
    if (['.html', '.css', '.js', '.json'].includes(ext)) headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(content);
  });
}

function getFilePath(url) {
  const rawPath = decodeURIComponent(url.split('?')[0]);
  const requestPath = rawPath === '/' ? '/index.html' : rawPath;
  return path.resolve(ROOT_DIR, `.${requestPath}`);
}

function isPublicFilePath(url) {
  let requestPath;
  try { requestPath = decodeURIComponent(url.split('?')[0]); } catch (_) { return false; }
  return requestPath === '/' || requestPath === '/index.html'
    // This is browser runtime configuration only (API path and feature flag),
    // not a server-side environment file.  Keep the exception exact so the
    // rest of config/ and all backend files remain unavailable.
    || requestPath === '/config/config.js'
    || /^\/(?:css|js)\/[A-Za-z0-9._/-]+$/.test(requestPath);
}

function createUiServer() {
  return http.createServer((req, res) => {
    setSecurityHeaders(res);
    if (req.url === '/api' || req.url.startsWith('/api/')) {
      const proxyRequest = http.request({
        hostname: API_HOST,
        port: API_PORT,
        path: req.url,
        method: req.method,
        headers: Object.assign({}, req.headers, {
          host: `${API_HOST}:${API_PORT}`,
          'x-forwarded-host': req.headers.host || '',
          'x-forwarded-proto': 'http'
        })
      }, (proxyResponse) => {
        res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
        proxyResponse.pipe(res);
      });
      proxyRequest.on('error', (error) => {
        console.error(`API proxy error for ${req.method} ${req.url}: ${error.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        res.end(JSON.stringify({ success: false, message: 'Backend API is unavailable' }));
      });
      req.pipe(proxyRequest);
      return;
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method not allowed');
      return;
    }

    // Never expose source code, backend configuration, database exports, or
    // environment files from the repository root. Only the browser assets
    // explicitly required by this UI may be served.
    if (!isPublicFilePath(req.url || '')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const filePath = getFilePath(req.url);

    if (!filePath.startsWith(ROOT_DIR + path.sep) && filePath !== ROOT_DIR) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (!error && stats.isDirectory()) {
        sendFile(res, path.join(filePath, 'index.html'));
        return;
      }

      if (!error) {
        sendFile(res, filePath);
        return;
      }

      // Keep client-side routes accessible when the static server owns the URL.
      const isPageRequest = !path.extname(filePath);
      sendFile(res, isPageRequest ? INDEX_FILE : filePath);
    });
  });
}

function startUiServer(options = {}) {
  const host = options.host || HOST;
  const port = Number(options.port || PORT);
  const displayHost = options.displayHost || DISPLAY_HOST;
  const server = createUiServer();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && options.ignorePortInUse) {
      console.log(`Application UI already appears to be running at http://${displayHost}:${port}`);
      return;
    }

    console.error(`Unable to start Application UI at http://${displayHost}:${port}: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`Application UI running at http://${displayHost}:${port}`);
  });

  return server;
}

if (require.main === module) {
  startUiServer();
}

module.exports = {
  startUiServer
};
