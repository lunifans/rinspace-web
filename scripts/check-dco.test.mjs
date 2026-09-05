import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectPullRequestCommits,
  evaluateDcoCommits,
  getDcoPolicyBlockers,
  validateDcoPolicy,
} from './check-dco.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkedIn = JSON.parse(fs.readFileSync(path.join(root, 'config/dco-policy.json'), 'utf8'));

function humanCommit(message, overrides = {}) {
  return {
    sha: '0123456789abcdef0123456789abcdef01234567',
    author: { id: 101, login: 'contributor', type: 'User' },
    commit: {
      author: { name: 'Example Contributor', email: 'contributor@users.noreply.github.com' },
      message,
    },
    ...overrides,
  };
}

test('checked-in DCO policy is operational and document-bound', () => {
  assert.equal(validateDcoPolicy(checkedIn), checkedIn);
  assert.deepEqual(getDcoPolicyBlockers(checkedIn), []);
  assert.deepEqual(checkedIn.blockers, []);
});

test('a matching sign-off passes without any external contributor registry', () => {
  const result = evaluateDcoCommits([
    humanCommit('Improve docs\n\nSigned-off-by: Example Contributor <contributor@users.noreply.github.com>'),
  ], checkedIn);
  assert.equal(result.passed, true);
  assert.deepEqual(result.checkedCommits, ['0123456789ab']);
});

test('missing or mismatched author sign-offs fail closed without exposing personal data', () => {
  for (const message of [
    'Unsigned change',
    'Wrong signer\n\nSigned-off-by: Somebody Else <else@example.invalid>',
  ]) {
    const result = evaluateDcoCommits([humanCommit(message)], checkedIn);
    assert.equal(result.passed, false);
    assert.deepEqual(result.blockers, ['commit:0123456789ab:author-signoff-missing-or-mismatched']);
    assert.equal(result.blockers.join('\n').includes('@'), false);
  }
});

test('identity matching is case-insensitive and accepts GitHub noreply addresses', () => {
  const result = evaluateDcoCommits([
    humanCommit('Case only\n\nSigned-off-by: example contributor <CONTRIBUTOR@USERS.NOREPLY.GITHUB.COM>'),
  ], checkedIn);
  assert.equal(result.passed, true);
});

test('every coauthor needs a matching sign-off', () => {
  const message = [
    'Pair change',
    '',
    'Co-authored-by: Second Person <second@example.invalid>',
    'Signed-off-by: Example Contributor <contributor@users.noreply.github.com>',
  ].join('\n');
  const failed = evaluateDcoCommits([humanCommit(message)], checkedIn);
  assert.equal(failed.passed, false);
  assert.ok(failed.blockers.includes('commit:0123456789ab:coauthor-1-signoff-missing-or-mismatched'));
  const passed = evaluateDcoCommits([
    humanCommit(`${message}\nSigned-off-by: Second Person <second@example.invalid>`),
  ], checkedIn);
  assert.equal(passed.passed, true);
});

test('only the exact reviewed bot identity is exempt', () => {
  const dependabot = humanCommit('Automated update', {
    author: { id: 49699333, login: 'dependabot[bot]', type: 'Bot' },
  });
  assert.equal(evaluateDcoCommits([dependabot], checkedIn).passed, true);
  const impersonator = structuredClone(dependabot);
  impersonator.author.id = 999;
  assert.equal(evaluateDcoCommits([impersonator], checkedIn).passed, false);
  const unknown = structuredClone(dependabot);
  unknown.author = { id: 998, login: 'unknown[bot]', type: 'Bot' };
  assert.equal(evaluateDcoCommits([unknown], checkedIn).passed, false);
});

test('document changes fail until the reviewed digest changes with them', (context) => {
  const fixture = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'rinspace-dco-'));
  context.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.copyFileSync(path.join(root, 'DCO'), path.join(fixture, 'DCO'));
  fs.writeFileSync(path.join(fixture, 'CONTRIBUTION-LICENSE.md'), 'changed\n');
  assert.deepEqual(getDcoPolicyBlockers(checkedIn, { repositoryRoot: fixture }), [
    'document-digest-mismatch:CONTRIBUTION-LICENSE.md',
  ]);
});

test('GitHub commit collection uses a read token only against the trusted endpoint', async () => {
  const calls = [];
  const payload = [humanCommit('Signed\n\nSigned-off-by: Example Contributor <contributor@users.noreply.github.com>')];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => payload };
  };
  const commits = await collectPullRequestCommits({
    repository: { full_name: 'rinspacehq/rinspace-web', url: 'https://api.github.com/repos/rinspacehq/rinspace-web' },
    pull_request: { number: 7 },
  }, { token: 'test-token', fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0].options.headers.authorization, /^Bearer /);
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(commits, payload);
});

test('pagination cannot send the read token outside the exact GitHub API path', async () => {
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
  await assert.rejects(() => collectPullRequestCommits({
    repository: { full_name: 'rinspacehq/rinspace-web', url: 'https://api.github.com/repos/rinspacehq/rinspace-web' },
    pull_request: { number: 8 },
  }, { token: 'test-token', fetchImpl }), /pagination URL escaped/);
  assert.equal(calls, 1);
});
