// Verify the actual listener and HTTPS Web shell without trusting published ports.
import fs from 'node:fs';
import https from 'node:https';

const port = Number(process.env.WEB_CONTAINER_PORT);
const portHex = port.toString(16).toUpperCase().padStart(4, '0');
const listening = fs.readFileSync('/proc/net/tcp', 'utf8').split('\n').some((line) => {
  const fields = line.trim().split(/\s+/);
  return fields[1] === `00000000:${portHex}` && fields[3] === '0A';
});
if (!listening) process.exit(1);

const request = https.get({ hostname: '127.0.0.1', port, path: '/', rejectUnauthorized: false, timeout: 2000 }, (response) => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', (chunk) => { body += chunk; });
  response.on('end', () => {
    const healthy = response.statusCode === 200
      && response.headers['cross-origin-opener-policy'] === 'same-origin'
      && response.headers['cross-origin-embedder-policy'] === 'require-corp'
      && body.includes('<title>Luna</title>');
    process.exit(healthy ? 0 : 1);
  });
});
request.on('timeout', () => request.destroy());
request.on('error', () => process.exit(1));
