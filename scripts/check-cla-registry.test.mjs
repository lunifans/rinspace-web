import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectPullRequestContributors,
  evaluateContributorCoverage,
  getClaRegistryBlockers,
  validateClaRegistry,
} from './check-cla-registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkedIn = JSON.parse(fs.readFileSync(path.join(root, 'config/cla-registry.json'), 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function operationalRegistry() {
  const registry = clone(checkedIn);
  registry.status = 'operational';
  registry.blockers = [];
  for (const key of Object.keys(registry.operationalEvidence)) {
    registry.operationalEvidence[key] = `evidence:cla/${key}.json`;
  }
  return registry;
}

function record(userId, agreementType = 'individual') {
  return {
    githubLogin: `contributor-${userId}`,
    githubUserId: String(userId),
    agreementType,
    agreementSha256: checkedIn.agreements[agreementType].sha256,
    privacyNoticeSha256: checkedIn.agreements.privacyNotice.sha256,
    acceptedAt: '2026-09-04T00:00:00.000Z',
    evidenceRef: `private-cla-record:record-${userId}`,
  };
}

function contributor(userId, type = 'User') {
  return { githubLogin: `contributor-${userId}`, githubUserId: String(userId), type, reference: `user:${userId}` };
}

test('checked-in registry is deliberately disabled and document-bound', () => {
  assert.equal(validateClaRegistry(checkedIn), checkedIn);
  assert.deepEqual(getClaRegistryBlockers(checkedIn), ['registry-not-operational']);
  assert.equal(checkedIn.records.length, 0);
});

test('an individual record covers repeated appearances of the same GitHub user id', () => {
  const registry = operationalRegistry();
  registry.records.push(record(101));
  const result = evaluateContributorCoverage([contributor(101), contributor(101)], registry);
  assert.equal(result.passed, true);
  assert.deepEqual(result.coveredUserIds, ['101']);
});

test('agreement version upgrades fail closed until the contributor signs the new digest', () => {
  const registry = operationalRegistry();
  const stale = record(102);
  stale.agreementSha256 = '0'.repeat(64);
  registry.records.push(stale);
  assert.throws(() => validateClaRegistry(registry), /agreementSha256 is stale/);
});

test('every distinct human contributor must have a record', () => {
  const registry = operationalRegistry();
  registry.records.push(record(103));
  const result = evaluateContributorCoverage([contributor(103), contributor(104)], registry);
  assert.equal(result.passed, false);
  assert.ok(result.blockers.includes('cla-record-missing:104'));
});

test('a corporate contributor is bound to the CCLA and an opaque private evidence record', () => {
  const registry = operationalRegistry();
  const corporate = record(105, 'corporate');
  registry.records.push(corporate);
  assert.equal(evaluateContributorCoverage([contributor(105)], registry).passed, true);
  corporate.agreementType = 'individual';
  assert.throws(() => validateClaRegistry(registry), /agreementSha256 is stale/);
});

test('bots require an exact numeric-id exemption and humans cannot use it', () => {
  const registry = operationalRegistry();
  registry.botExemptions.push({
    githubLogin: 'dependency-bot[bot]',
    githubUserId: '106',
    reason: 'Test-only dependency update bot.',
    approvedBy: 'test-maintainer',
    approvedAt: '2026-09-04T00:00:00.000Z',
  });
  assert.equal(evaluateContributorCoverage([contributor(106, 'Bot')], registry).passed, true);
  assert.equal(evaluateContributorCoverage([contributor(107, 'Bot')], registry).passed, false);
  assert.equal(evaluateContributorCoverage([contributor(106, 'User')], registry).passed, false);
});

test('unlinked commit authors and coauthors fail closed without exposing email addresses', () => {
  const registry = operationalRegistry();
  const result = evaluateContributorCoverage([
    { unresolved: true, reference: 'commit:0123456789ab' },
    { unresolved: true, reference: 'commit:0123456789ab:coauthor-1' },
  ], registry);
  assert.equal(result.passed, false);
  assert.equal(result.blockers.length, 2);
  assert.equal(result.blockers.join('\n').includes('@'), false);
});

test('GitHub commit collection uses numeric identities and marks coauthor trailers unresolved', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [{
        sha: '0123456789abcdef',
        author: { id: 202, login: 'commit-author', type: 'User' },
        commit: { message: 'Change\n\nCo-authored-by: Private Person <private@example.invalid>' },
      }],
    };
  };
  const contributors = await collectPullRequestContributors({
    repository: {
      full_name: 'lunifans/rinspace-web',
      url: 'https://api.github.com/repos/lunifans/rinspace-web',
    },
    pull_request: { number: 7, user: { id: 201, login: 'pr-author', type: 'User' } },
  }, { token: 'test-token', fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0].options.headers.authorization, /^Bearer /);
  assert.deepEqual(contributors.map((item) => item.githubUserId ?? item.reference), [
    '201',
    '202',
    'commit:0123456789ab:coauthor-1',
  ]);
  assert.equal(JSON.stringify(contributors).includes('private@example.invalid'), false);
});

test('GitHub pagination cannot redirect the read token outside the trusted API endpoint', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => '<https://attacker.invalid/collect>; rel="next"' },
      json: async () => [],
    };
  };
  await assert.rejects(() => collectPullRequestContributors({
    repository: {
      full_name: 'lunifans/rinspace-web',
      url: 'https://api.github.com/repos/lunifans/rinspace-web',
    },
    pull_request: { number: 8, user: { id: 203, login: 'pr-author', type: 'User' } },
  }, { token: 'test-token', fetchImpl }), /pagination URL escaped/);
  assert.equal(calls, 1);
});
