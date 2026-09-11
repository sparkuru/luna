import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { atomicWritePrivateFile } from './atomic-file';

test('cancellation immediately before atomic rename preserves original bytes and removes its temporary file', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'luna-config-abort-'));
  const destination = path.join(directory, 'settings.json');
  try {
    await atomicWritePrivateFile(destination, 'original settings bytes');
    const controller = new AbortController();
    const check = controller.signal.throwIfAborted.bind(controller.signal);
    let checks = 0;
    t.mock.method(controller.signal, 'throwIfAborted', () => {
      if (++checks === 2) controller.abort();
      check();
    });
    await assert.rejects(atomicWritePrivateFile(destination, 'cancelled replacement', controller.signal), { name: 'AbortError' });
    assert.equal(checks, 2);
    assert.equal(await readFile(destination, 'utf8'), 'original settings bytes');
    assert.deepEqual(await readdir(directory), ['settings.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
