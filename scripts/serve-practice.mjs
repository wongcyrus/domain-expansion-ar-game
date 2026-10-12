import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const root = resolve('dist-practice');
const base = process.env.PRACTICE_BASE_PATH || '/domain-expansion-ar-game/';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.mp4': 'video/mp4' };

createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(request.method) || !pathname.startsWith(base)) {
    response.writeHead(404).end();
    return;
  }
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(base.length)) || 'index.html';
  } catch (error) {
    console.warn('Invalid static asset path:', error.message);
    response.writeHead(400).end();
    return;
  }
  const file = resolve(root, relative);
  if (!file.startsWith(`${root}/`) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  const extension = file.slice(file.lastIndexOf('.'));
  response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('error', error => {
    console.error('Unable to serve practice asset:', error);
    response.destroy(error);
  });
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}).listen(Number(process.env.PRACTICE_PORT || 4174), '127.0.0.1');
