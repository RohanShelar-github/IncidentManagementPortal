const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = process.env.UI_HOST || '0.0.0.0';
const DISPLAY_HOST = process.env.UI_DISPLAY_HOST || 'localhost';
const PORT = Number(process.env.UI_PORT || 5500);
const ROOT_DIR = path.resolve(__dirname);
const INDEX_FILE = path.join(ROOT_DIR, 'index.html');

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

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function getFilePath(url) {
  const rawPath = decodeURIComponent(url.split('?')[0]);
  const requestPath = rawPath === '/' ? '/index.html' : rawPath;
  return path.resolve(ROOT_DIR, `.${requestPath}`);
}

function createUiServer() {
  return http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method not allowed');
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
