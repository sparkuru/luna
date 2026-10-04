import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repo = path.resolve(import.meta.dirname, '..');
const config = fs.readFileSync(path.join(repo, '.env.example'), 'utf8');
const mockDocker = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const statePath = process.env.MOCK_STATE;
const logPath = process.env.MOCK_LOG;
fs.appendFileSync(logPath, JSON.stringify(args)+'\\n');
let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : null;
const output = text => process.stdout.write(text+'\\n');
if (args[0] === 'context') {
  output(process.env.MOCK_CONTEXT_ENDPOINT || 'unix:///var/run/docker.sock');
} else if (args[0] === 'ps') {
  if (!args.includes('label=hako.repo='+process.env.MOCK_REPO) || !args.includes('label=hako.scope=dev.sh') || !args.includes('label=hako.service=web')) process.exit(10);
  if (state) output('owned-web');
} else if (args[0] === 'image') {
  if (process.env.MOCK_MISSING_IMAGE) process.exit(1);
} else if (args[0] === 'run') {
  const mapping = args[args.indexOf('-p')+1].match(/^(.*):([0-9]+):([0-9]+)$/);
  const labels = {};
  args.forEach((arg, i) => { if(arg === '--label') { const value = args[i+1]; const at = value.indexOf('='); labels[value.slice(0, at)] = value.slice(at+1); }});
  state = { labels, mapping: mapping[1]+':'+(mapping[2] === '0' ? '49123' : mapping[2]), running: true };
  fs.writeFileSync(statePath, JSON.stringify(state));
  if (args.includes('--cidfile')) fs.writeFileSync(args[args.indexOf('--cidfile')+1], 'owned-web');
  output('owned-web');
} else if (args[0] === 'inspect') {
  const format = args[args.indexOf('--format')+1];
  if (!state) process.exit(1);
  if (state.pendingRemoval && !args.includes('--format')) {
    state.removalPolls += 1;
    if (state.removalPolls >= 3) { fs.unlinkSync(statePath); process.exit(1); }
    fs.writeFileSync(statePath, JSON.stringify(state));
    output('removal pending'); process.exit(0);
  }
  if (format.includes('.State.Running')) output(String(state.running));
  else if (format.includes('.State.Status')) output(state.running ? 'running' : 'exited');
  else { const match = format.match(/"([^"]+)"/); output(state.labels[match[1]]); }
} else if (args[0] === 'port') {
  if (!state) process.exit(1);
  output(state.mapping);
} else if (args[0] === 'exec') {
  if (process.env.MOCK_FAIL_READY) process.exit(1);
} else if (args[0] === 'stop') {
  if (args.slice(1).some(id => id !== 'owned-web')) process.exit(11);
  if (state && process.env.MOCK_DELAY_REMOVE) {
    state.running = false; state.pendingRemoval = true; state.removalPolls = 0;
    fs.writeFileSync(statePath, JSON.stringify(state));
  } else if(state) fs.unlinkSync(statePath);
} else if (args[0] === 'logs') {
  output('mock Vite not ready');
} else if (args[0] !== 'build') {
  process.exit(12);
}
`;

function fixture(t, environment = config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-preview-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'bin'));
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', '.bin', 'vite'), '#!/bin/sh\n', { mode: 0o755 });
  for (const file of ['preview.sh', 'dev.sh', 'hako', 'Dockerfile', 'scripts/preview-config.sh', 'scripts/preview-console.sh']) {
    fs.copyFileSync(path.join(repo, file), path.join(root, file));
  }
  if (environment !== null) fs.writeFileSync(path.join(root, '.env'), environment);
  fs.writeFileSync(path.join(root, 'bin', 'docker'), mockDocker, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'bin', 'ip'), '#!/usr/bin/env node\nif (process.env.MOCK_IP_FAIL) process.exit(1); process.stdout.write(process.env.MOCK_IP_DATA || "lo UNKNOWN 127.0.0.1/8 ::1/128\\neth0 UP 192.0.2.10/24 192.0.2.11/24 2001:db8::10/64 fe80::1/64\\ntun0 UNKNOWN 198.51.100.20/32 192.0.2.10/24\\nbr0 UP 172.18.0.1/16\\ndown DOWN 203.0.113.99/24\\n");\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'bin', 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const log = path.join(root, 'docker.jsonl');
  const state = path.join(root, 'state.json');
  const env = { ...process.env, PATH: path.join(root, 'bin') + ':' + process.env.PATH, MOCK_LOG: log, MOCK_STATE: state, MOCK_REPO: root };
  delete env.DOCKER_HOST; delete env.DOCKER_CONTEXT; delete env.NODE_TEST_CONTEXT;
  for (const key of ['HAKO_IMAGE', 'HAKO_BIND_HOST', 'WEB_HOST_PORT', 'WEB_CONTAINER_HOST', 'WEB_CONTAINER_PORT', 'WEB_LAN_HOST', 'PREVIEW_READY_TIMEOUT', 'LUNA_PREVIEW_PORT']) delete env[key];
  return {
    root, state,
    run(args = [], overrides = {}) {
      return spawnSync(path.join(root, 'preview.sh'), args, { cwd: os.tmpdir(), env: { ...env, ...overrides }, encoding: 'utf8' });
    },
    calls() { return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []; },
    parse(environmentPath, overrides = {}) {
      return spawnSync('bash', ['-c', 'source "$1"; load_preview_config "$2" true; validate_preview_config; printf "%s" "$WEB_HOST_PORT"', '_', path.join(root, 'scripts/preview-config.sh'), environmentPath], { env: { ...env, ...overrides }, encoding: 'utf8' });
    },
  };
}

test('missing .env gives setup guidance without Docker startup or creating it', (t) => {
  const f = fixture(t, null);
  for (const action of ['start', 'build']) {
    const result = f.run([action]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cp .env.example .env/);
  }
  assert.deepEqual(f.calls(), []);
  assert.equal(fs.existsSync(path.join(f.root, '.env')), false);
  assert.equal(f.run(['down']).status, 0);
  assert.notEqual(f.run(['status']).status, 0);
});

test('dotenv validates empties, duplicates, missing keys, and never executes text', (t) => {
  for (const invalid of [config.replace('WEB_HOST_PORT=4173', 'WEB_HOST_PORT='), config + '\nWEB_HOST_PORT=4500\n', config.replace('WEB_CONTAINER_PORT=4173\n', '')]) {
    const f = fixture(t, invalid);
    assert.notEqual(f.run().status, 0);
    assert.deepEqual(f.calls(), []);
  }
  const f = fixture(t, config);
  const sentinel = path.join(f.root, 'must-not-exist');
  fs.writeFileSync(path.join(f.root, '.env'), config.replace('WEB_HOST_PORT=4173', `WEB_HOST_PORT=$(touch ${sentinel})`));
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.existsSync(sentinel), false);
});

test('custom CRLF/quoted values persist unchanged and repeated reads do not append', (t) => {
  const customized = config.replace('WEB_HOST_PORT=4173', "export WEB_HOST_PORT = '04500' # custom").replaceAll('\n', '\r\n');
  const f = fixture(t, customized);
  const file = path.join(f.root, '.env');
  for (let i = 0; i < 2; i++) {
    const result = f.parse(file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '4500');
    assert.equal(fs.readFileSync(file, 'utf8'), customized);
  }
  assert.notEqual(f.run([], { WEB_HOST_PORT: '' }).status, 0);
});

test('start is background/idempotent, status uses actual port, stop owns only preview and retains data', (t) => {
  const f = fixture(t, config.replace('WEB_HOST_PORT=4173', 'WEB_HOST_PORT=0'));
  fs.writeFileSync(path.join(f.root, 'persistent-data'), 'retain');
  let result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /System is ready/);
  assert.match(result.stdout, /Listening web: 0.0.0.0:4173/);
  assert.match(result.stdout, /Published web: 0.0.0.0:49123/);
  assert.match(result.stdout, /Website \(web\):\nhttps:\/\/127.0.0.1:49123/);
  assert.doesNotMatch(result.stdout, /https:\/\/0.0.0.0/);
  result = f.run(['start', '--port', '5000']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /49123/);
  assert.equal(f.run(['status']).status, 0);
  const calls = f.calls();
  assert.equal(calls.filter(([command]) => command === 'run').length, 1);
  assert.equal(calls.filter(([command]) => command === 'build').length, 0);
  const run = calls.find(([command]) => command === 'run');
  assert.ok(run.includes('--detach'));
  assert.ok(!run.includes('-i') && !run.includes('-t'));
  assert.equal(f.run(['stop']).status, 0);
  assert.equal(f.run(['down']).status, 0);
  assert.equal(fs.readFileSync(path.join(f.root, 'persistent-data'), 'utf8'), 'retain');
  assert.ok(!fs.existsSync(f.state));
});

test('explicit build never starts; CLI and environment override root port', (t) => {
  const f = fixture(t);
  assert.equal(f.run(['build']).status, 0);
  assert.equal(f.calls().filter(([command]) => command === 'run').length, 0);
  assert.equal(f.run(['start', '--port=45123'], { WEB_HOST_PORT: '45000' }).status, 0);
  assert.match(f.calls().find(([command]) => command === 'run').join(' '), /0.0.0.0:45123:4173/);
});

test('stop waits for asynchronous Docker removal before an immediate restart', (t) => {
  const f = fixture(t);
  assert.equal(f.run(['start']).status, 0);
  const result = f.run(['stop'], { MOCK_DELAY_REMOVE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(f.state), false);
  assert.equal(f.calls().filter(args => args[0] === 'inspect' && !args.includes('--format')).length, 3);
  const restart = f.run(['start']);
  assert.equal(restart.status, 0, restart.stderr);
});

test('IPv6 wildcard publishing reports a loopback browser URL', (t) => {
  const f = fixture(t, config.replace('HAKO_BIND_HOST=0.0.0.0', 'HAKO_BIND_HOST=[::]'));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Published web: \[::\]:4173/);
  assert.match(result.stdout, /Website \(web\):\nhttps:\/\/\[::1\]:4173/);
  assert.doesNotMatch(result.stdout, /https:\/\/\[::\]:/);
  assert.match(result.stdout, /https:\/\/\[2001:db8::10\]:4173/);
  assert.doesNotMatch(result.stdout, /https:\/\/192.0.2/);
});

test('missing image and invalid arguments fail without build or startup', (t) => {
  const f = fixture(t);
  const missingImage = f.run(['start'], { MOCK_MISSING_IMAGE: '1' });
  assert.notEqual(missingImage.status, 0);
  assert.match(missingImage.stderr, /missing image; run .\/preview.sh build/);
  for (const args of [['unknown'], ['--port'], ['--port='], ['--port', ''], ['--port', 'no'], ['--port', '65536'], ['status', '--port', '45000'], ['build', '--unknown']]) {
    assert.notEqual(f.run(args).status, 0, args.join(' '));
  }
  assert.ok(!f.calls().some(([command]) => command === 'run' || command === 'build'));
  assert.equal(fs.existsSync(f.state), false);
});

test('an unhealthy existing preview is reported and preserved without a duplicate start', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const result = f.run(['start'], { MOCK_FAIL_READY: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unavailable\/unhealthy/);
  assert.doesNotMatch(result.stdout, /System is ready|Website:/);
  assert.equal(f.calls().filter(([command]) => command === 'run').length, 1);
  assert.ok(!f.calls().some(([command]) => command === 'stop'));
  assert.equal(fs.existsSync(f.state), true);
  fs.unlinkSync(path.join(f.root, '.env'));
  assert.equal(f.run(['stop']).status, 0);
  assert.equal(f.run(['down']).status, 0);
});

test('readiness failure returns nonzero, never announces URLs, cleans only new owned container', (t) => {
  const f = fixture(t, config.replace('PREVIEW_READY_TIMEOUT=30', 'PREVIEW_READY_TIMEOUT=1'));
  const result = f.run(['start'], { MOCK_FAIL_READY: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /System is ready|Website:/);
  assert.ok(f.calls().some(([command, id]) => command === 'stop' && id === 'owned-web'));
  assert.ok(!fs.existsSync(f.state));
});

test('unified output enumerates every eligible host address and ready status matches start', (t) => {
  const f = fixture(t);
  const started = f.run();
  assert.equal(started.status, 0, started.stderr);
  assert.equal(started.stderr, '');
  for (const host of ['192.0.2.10', '192.0.2.11', '198.51.100.20', '172.18.0.1']) {
    assert.equal(started.stdout.split('https://' + host + ':4173').length - 1, 1);
  }
  assert.doesNotMatch(started.stdout, /203.0.113.99|https:\/\/0.0.0.0|\/24|https:\/\/\[2001/);
  assert.ok(started.stdout.indexOf('Open:') < started.stdout.indexOf('Local only (preview host):'));
  assert.ok(started.stdout.indexOf('Local only (preview host):') < started.stdout.indexOf('Listeners:'));
  const status = f.run(['status']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout, started.stdout);
  assert.equal(f.run(['start']).stdout, started.stdout);
});

test('discovery failure prevents startup and remote daemon never uses caller addresses', (t) => {
  for (const overrides of [{ MOCK_IP_FAIL: '1' }, { DOCKER_HOST: 'ssh://example.invalid' }]) {
    const f = fixture(t);
    const result = f.run(['start'], overrides);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /System is ready|Open:/);
    assert.ok(!f.calls().some(([command]) => command === 'run'));
  }
});

test('specific and loopback binds preserve exposure while verbose reveals wrapper diagnostics', (t) => {
  const local = fixture(t, config.replace('HAKO_BIND_HOST=0.0.0.0', 'HAKO_BIND_HOST=127.0.0.1'));
  const result = local.run(['start', '--verbose'], { MOCK_IP_FAIL: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Open:/);
  assert.match(result.stdout, /Local only \(preview host\):/);
  assert.match(result.stderr, /hako run/);
  const specific = fixture(t, config.replace('HAKO_BIND_HOST=0.0.0.0', 'HAKO_BIND_HOST=192.0.2.10'));
  const bound = specific.run([], { MOCK_IP_FAIL: '1' });
  assert.equal(bound.status, 0, bound.stderr);
  assert.match(bound.stdout, /https:\/\/192.0.2.10:4173/);
  assert.doesNotMatch(bound.stdout, /192.0.2.11|Local only/);
});
