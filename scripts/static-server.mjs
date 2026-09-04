import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { cacheControlForPath } from './static-package.mjs';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function loadContract(rootDirectory) {
  const fileName = path.join(rootDirectory, 'static-headers.json');
  if (!fs.existsSync(fileName)) throw new Error(`Packaged header contract is missing: ${fileName}`);
  const contract = JSON.parse(fs.readFileSync(fileName, 'utf8'));
  if (contract.schemaVersion !== 1 || typeof contract.basePath !== 'string' || typeof contract.spaFallback !== 'string') {
    throw new Error('Packaged header contract is invalid.');
  }
  return contract;
}

function safeFile(rootDirectory, relativePath) {
  const candidate = path.resolve(rootDirectory, relativePath);
  if (!candidate.startsWith(`${rootDirectory}${path.sep}`)) return null;
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  return candidate;
}

function writeResponse(response, status, headers, body = '') {
  response.writeHead(status, headers);
  response.end(body);
}

function wantsHtml(request) {
  return (request.headers.accept || '').split(',').some((value) => value.trim().startsWith('text/html'));
}

export function createArtifactRequestHandler(rootInput, assetInput = rootInput) {
  const rootDirectory = path.resolve(rootInput);
  const assetDirectory = path.resolve(assetInput);
  const contract = loadContract(rootDirectory);
  const securityHeaders = contract.securityHeaders || {};
  return (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      writeResponse(response, 405, { ...securityHeaders, Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname);
    } catch {
      writeResponse(response, 400, { ...securityHeaders, 'Cache-Control': 'no-store' });
      return;
    }
    if (pathname === '/healthz') {
      writeResponse(response, 200, {
        ...securityHeaders,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      }, request.method === 'HEAD' ? '' : '{"status":"ok"}\n');
      return;
    }
    if (pathname === '/version.json') {
      const versionFile = safeFile(assetDirectory, 'version.json') || safeFile(rootDirectory, 'version.json');
      if (!versionFile) {
        writeResponse(response, 500, { ...securityHeaders, 'Cache-Control': 'no-store' });
        return;
      }
      response.writeHead(200, { ...securityHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(versionFile).pipe(response);
      return;
    }
    const basePath = contract.basePath;
    const baseRoot = basePath === '/' ? '/' : basePath.slice(0, -1);
    if (pathname !== baseRoot && !pathname.startsWith(basePath)) {
      writeResponse(response, 404, { ...securityHeaders, 'Cache-Control': 'no-store' });
      return;
    }
    const relative = pathname === baseRoot ? '' : pathname.slice(basePath.length);
    const requestedFile = relative || 'index.html';
    let target = safeFile(rootDirectory, requestedFile) || safeFile(assetDirectory, requestedFile);
    let servedRelative = requestedFile;
    if (!target) {
      const isAssetRequest = path.posix.basename(relative).includes('.') || /^(?:assets|fonts|static|templates)\//.test(relative);
      if (isAssetRequest || !wantsHtml(request)) {
        writeResponse(response, 404, { ...securityHeaders, 'Cache-Control': 'no-store' });
        return;
      }
      servedRelative = 'index.html';
      target = safeFile(rootDirectory, servedRelative);
    }
    if (!target) {
      writeResponse(response, 500, { ...securityHeaders, 'Cache-Control': 'no-store' });
      return;
    }
    const headers = {
      ...securityHeaders,
      'Cache-Control': cacheControlForPath(servedRelative),
      'Content-Type': contentTypes[path.extname(target).toLowerCase()] || 'application/octet-stream',
    };
    if (servedRelative === 'mockServiceWorker.js') {
      headers['Cache-Control'] = 'no-store';
      headers['Service-Worker-Allowed'] = basePath;
    }
    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(target).pipe(response);
  };
}

export function startArtifactServer({ rootDirectory, assetDirectory = rootDirectory, port = 4173, host = '127.0.0.1' }) {
  return http.createServer(createArtifactRequestHandler(rootDirectory, assetDirectory)).listen(port, host);
}
