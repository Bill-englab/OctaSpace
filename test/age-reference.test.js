import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgeReference } from '../server/age-reference.js';

test('a newly four-year-old child receives current and future guidance in five dimensions', () => {
  const reference = getAgeReference('2022-09-25', '2026-10-13');
  assert.equal(reference.ageMonths, 48);
  assert.equal(reference.ageLabel, '4岁0个月');
  assert.deepEqual(new Set(reference.items.map(x => x.dimension)), new Set(['de', 'zhi', 'ti', 'mei', 'lao']));
  assert.ok(reference.items.some(x => x.stage === 'current'));
  assert.ok(reference.items.some(x => x.stage === 'next'));
  assert.ok(reference.items.every(x => x.id && x.text && x.sourceUrl));
});

test('unsupported or absent age does not borrow a four-year reference', () => {
  assert.equal(getAgeReference('', '2026-10-13'), null);
  assert.equal(getAgeReference('2020-01-01', '2026-10-13'), null);
});
