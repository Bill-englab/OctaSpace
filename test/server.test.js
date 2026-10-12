import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';

test('journal opens directly without a family access code', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'growth-journal-'));
  const app = createApp({ dataDir });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    assert.equal((await fetch(`${url}/api/profile`)).status, 200);
    assert.equal((await fetch(`${url}/api/login`, { method: 'POST' })).status, 404);
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
