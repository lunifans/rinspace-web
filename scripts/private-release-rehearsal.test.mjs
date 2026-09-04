import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { privateRehearsalChecks, validatePrivateReleaseRehearsal } from './private-release-rehearsal.mjs';

function fixture() {
  return {
    schemaVersion: 1,
    repository: 'lunifans/rinspace-web',
    repositoryVisibility: 'private',
    commit: '1'.repeat(40),
    tag: 'v0.2.0',
    previousTag: 'v0.1.0',
    checks: Object.fromEntries(privateRehearsalChecks.map((name) => [name, { status: 'passed', reference: `evidence/${name}.json` }])),
    verifiedAt: '2026-09-02T09:00:00.000Z',
  };
}

test('accepts complete private-candidate evidence for exact immutable releases', () => {
  const value = fixture();
  assert.equal(validatePrivateReleaseRehearsal(value, {
    commit: value.commit,
    tag: value.tag,
    previousTag: value.previousTag,
  }), value);
  const schema = JSON.parse(fs.readFileSync('schemas/private-release-rehearsal.schema.json', 'utf8'));
  assert.equal(schema.additionalProperties, false);
});

test('rejects public repositories, mutable identities, missing checks, and unsupported self-claims', () => {
  assert.throws(() => validatePrivateReleaseRehearsal({ ...fixture(), repositoryVisibility: 'public' }), /while it is private/);
  assert.throws(() => validatePrivateReleaseRehearsal({ ...fixture(), commit: 'main' }), /full commit/);
  const missing = fixture();
  delete missing.checks.actionsLogs;
  assert.throws(() => validatePrivateReleaseRehearsal(missing), /missing or unexpected/);
  const failed = fixture();
  failed.checks.rollbackDemoData = { status: 'pending', reference: 'none' };
  assert.throws(() => validatePrivateReleaseRehearsal(failed), /not passing/);
});
