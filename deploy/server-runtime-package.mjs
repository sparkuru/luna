import { readFileSync, writeFileSync } from 'node:fs';

// Prune from the locked full installation; retain only server runtime roots.
const original = JSON.parse(readFileSync('package.json', 'utf8'));
const names = ['fastify', '@fastify/swagger', 'better-sqlite3', '@aws-sdk/client-s3'];
const dependencies = Object.fromEntries(names.map((name) => {
  if (!original.dependencies[name]) throw new Error(`Missing runtime dependency: ${name}`);
  return [name, original.dependencies[name]];
}));
writeFileSync('package.json', JSON.stringify({
  name: 'luna-server', version: original.version, private: true,
  engines: original.engines, dependencies, overrides: original.overrides,
}, null, 2) + '\n');
