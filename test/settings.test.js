import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/db.js';
import { saveMaasConfig, getMaasConfig } from '../server/settings.js';

test('MaaS settings never return the stored API key to a client', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'journal-settings-'));
  const store = openStore(dir);
  try {
    saveMaasConfig(store.db, { format: 'anthropic', baseUrl: 'https://maas.example', model: 'model-a', apiKey: 'secret' });
    assert.equal(getMaasConfig(store.db).hasKey, true);
    assert.equal(JSON.stringify(getMaasConfig(store.db)).includes('secret'), false);
    assert.equal(getMaasConfig(store.db, true).apiKey, 'secret');
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
