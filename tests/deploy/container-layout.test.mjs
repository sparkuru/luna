import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const repo = path.resolve(import.meta.dirname, '../..');

function buildContract(composeFile, projectDirectory) {
  const config = load(fs.readFileSync(path.join(repo, composeFile), 'utf8'));
  const base = projectDirectory ?? path.dirname(path.join(repo, composeFile));
  return Object.entries(config.services).filter(([, service]) => service.build).map(([service, config]) => {
    const build = typeof config.build === 'string' ? { context: config.build } : config.build;
    const context = path.resolve(base, build.context);
    const dockerfile = path.resolve(context, build.dockerfile ?? 'Dockerfile');
    return { service, context, dockerfile, target: build.target };
  });
}

function stages(dockerfile) {
  const lines = fs.readFileSync(dockerfile, 'utf8').replace(/\\\n\s*/g, ' ').split('\n');
  const result = [];
  for (const line of lines) {
    const from = /^FROM (\S+)(?: AS (\S+))?$/i.exec(line);
    if (from) result.push({ base: from[1], name: from[2], lines: [] });
    else if (result.length) result.at(-1).lines.push(line);
  }
  return result;
}

test('Compose build targets resolve to real Dockerfiles and complete repository inputs', () => {
  for (const composeFile of ['compose.yaml', 'docker/compose.android.yaml']) {
    for (const contract of buildContract(composeFile, repo)) {
      assert.equal(contract.context, repo, contract.service);
      assert.ok(fs.existsSync(contract.dockerfile), contract.dockerfile);
      const buildStages = stages(contract.dockerfile);
      if (contract.target) assert.ok(buildStages.some(stage => stage.name === contract.target), contract.service);
      for (const stage of buildStages) {
        for (const line of stage.lines) {
          if (!line.startsWith('COPY ') || line.includes('--from=')) continue;
          for (const source of line.slice(5).trim().split(/\s+/).slice(0, -1)) {
            assert.ok(fs.existsSync(path.resolve(contract.context, source)), `${contract.service}: ${source}`);
          }
        }
      }
    }
  }
});

test('optional Compose needs the documented project directory to keep Android inputs in the repo', () => {
  for (const contract of buildContract('docker/compose.android.yaml')) {
    assert.equal(fs.existsSync(contract.dockerfile), false, 'Missing --project-directory must not resolve to an unintended build tree');
  }
  const config = load(fs.readFileSync(path.join(repo, 'docker/compose.android.yaml'), 'utf8'));
  const mounts = Object.values(config.services).flatMap(service => service.volumes ?? []);
  for (const mount of mounts) {
    const [source] = mount.split(':');
    const resolved = path.resolve(repo, source);
    assert.ok(resolved === repo || resolved.startsWith(repo + path.sep));
  }
});

test('API and bucket bootstrap share a Node base without inheriting each other runtime settings', () => {
  const contracts = buildContract('compose.yaml', repo);
  const api = contracts.find(contract => contract.service === 'api');
  const initializer = contracts.find(contract => contract.service === 'bucket-init');
  assert.equal(api.dockerfile, initializer.dockerfile);
  assert.notEqual(api.target, initializer.target);
  const buildStages = stages(api.dockerfile);
  const apiStage = buildStages.find(stage => stage.name === api.target);
  const initStage = buildStages.find(stage => stage.name === initializer.target);
  assert.equal(apiStage.base, initStage.base);
  assert.ok(buildStages.find(stage => stage.name === apiStage.base).base.startsWith('node:'));
  assert.ok(apiStage.lines.some(line => line.startsWith('HEALTHCHECK ')));
  assert.ok(initStage.lines.some(line => line.startsWith('ENTRYPOINT ')));
  assert.ok(!apiStage.lines.some(line => line.startsWith('ENTRYPOINT ')));
  assert.ok(!initStage.lines.some(line => line.startsWith('HEALTHCHECK ')));
});

test('Docker contexts retain renderer data source while excluding persistent data and secrets', {
  skip: process.env.LUNA_DOCKER_CONTEXT_TEST !== '1' && 'Set LUNA_DOCKER_CONTEXT_TEST=1 with Docker and cached Node 22 available',
}, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-container-context-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const variant of ['production', 'android']) {
    const directory = path.join(root, variant);
    const dockerfile = variant === 'production' ? 'docker/Dockerfile.server' : 'docker/Dockerfile.android';
    const ignoreFile = variant === 'production' ? '.dockerignore' : 'docker/Dockerfile.android.dockerignore';
    const required = ['package.json', 'src/renderer/renderer.ts', 'src/renderer/data/local.tsx'];
    if (variant === 'android') required.push('android/gradlew', 'android/gradle/wrapper/gradle-wrapper.jar');
    const excluded = ['data/server.sqlite', '.env', 'archive/private', '.devhome/private'];
    for (const prefix of ['src/shared/', 'src/renderer/data/', ...(variant === 'android' ? ['android/'] : [])]) {
      for (const suffix of ['.env', '.env.local', '.luna/runtime.json', 'private.key', 'private.pem', 'private.jks', 'private.keystore', 'node_modules/private.js', '.devhome/private', 'archive/private']) excluded.push(prefix + suffix);
    }
    if (variant === 'android') excluded.push('android/.gradle/private', 'android/app/build/private', 'android/local.properties', 'android/app/src/main/assets/private');
    const put = (file, content) => {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    };
    for (const file of [...required, ...excluded]) put(file, 'synthetic-fixture-only\n');
    put(ignoreFile, fs.readFileSync(path.join(repo, ignoreFile)));
    const check = `const fs=require('node:fs');const assert=require('node:assert/strict');for(const p of ${JSON.stringify(required)})assert.ok(fs.existsSync('/context/'+p),'missing '+p);for(const p of ${JSON.stringify(excluded)})assert.ok(!fs.existsSync('/context/'+p),'leaked '+p);console.log('CONTEXT_OK ${variant}')`;
    assert.ok(!check.includes('$') && !check.includes('`'));
    put(dockerfile, `FROM node:22.22.0-bookworm-slim\nCOPY . /context\nRUN node -e ${JSON.stringify(check)}\n`);
    const runId = randomUUID();
    const image = `luna-cleanup-context-test-${runId}:local`;
    const owner = 'luna.cleanup-context-test';
    const result = spawnSync('docker', ['build', '--file', dockerfile, '--tag', image, '--label', `${owner}=${runId}`, '.'], {
      cwd: directory,
      env: { ...process.env, DOCKER_BUILDKIT: variant === 'production' ? '0' : '1' },
      encoding: 'utf8', timeout: 180_000, maxBuffer: 1_000_000,
    });
    try {
      assert.equal(result.status, 0, result.error?.message ?? result.stderr + result.stdout);
      assert.match(result.stdout + result.stderr, new RegExp(`CONTEXT_OK ${variant}`));
    } finally {
      const label = spawnSync('docker', ['image', 'inspect', '--format', `{{index .Config.Labels "${owner}"}}`, image], { encoding: 'utf8' });
      if (label.status === 0 && label.stdout.trim() === runId) {
        const removed = spawnSync('docker', ['image', 'rm', image], { encoding: 'utf8' });
        assert.equal(removed.status, 0, removed.stderr);
      }
    }
  }
});
