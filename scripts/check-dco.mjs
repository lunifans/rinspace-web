import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config/dco-policy.json');
const trustedRepository = 'rinspacehq/rinspace-web';
const trustedApiRoot = `https://api.github.com/repos/${trustedRepository}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, keys, label) {
  assert(isRecord(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} has unexpected or missing fields`,
  );
}

function isTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizedIdentity(name, email) {
  return `${String(name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()}\0${String(email ?? '').trim().toLocaleLowerCase()}`;
}

function trailers(message, kind) {
  const result = [];
  const pattern = new RegExp(`^${kind}:\\s*(.+?)\\s*<([^<>\\r\\n]+)>\\s*$`, 'gimu');
  for (const match of String(message ?? '').matchAll(pattern)) {
    result.push({ name: match[1].trim(), email: match[2].trim() });
  }
  return result;
}

export function validateDcoPolicy(policy) {
  assertExactKeys(policy, [
    '$schema', 'schemaVersion', 'status', 'repository', 'documents', 'signoffPolicy',
    'botExemptions', 'largeOrCorporateContributions', 'blockers',
  ], 'policy');
  assert(policy.$schema === '../schemas/dco-policy.schema.json', 'policy.$schema is invalid');
  assert(policy.schemaVersion === 1, 'policy.schemaVersion is invalid');
  assert(policy.status === 'operational', 'DCO policy is not operational');
  assert(policy.repository === trustedRepository, 'policy.repository is invalid');
  assertExactKeys(policy.documents, ['dco', 'contributionLicense'], 'policy.documents');
  assertExactKeys(policy.documents.dco, ['path', 'version', 'sha256'], 'policy.documents.dco');
  assert(policy.documents.dco.path === 'DCO', 'DCO path is invalid');
  assert(policy.documents.dco.version === '1.1', 'DCO version is invalid');
  assertExactKeys(
    policy.documents.contributionLicense,
    ['path', 'version', 'spdxIdentifier', 'sha256'],
    'policy.documents.contributionLicense',
  );
  assert(policy.documents.contributionLicense.path === 'CONTRIBUTION-LICENSE.md', 'contribution license path is invalid');
  assert(policy.documents.contributionLicense.version === '1.0', 'contribution license version is invalid');
  assert(policy.documents.contributionLicense.spdxIdentifier === 'Apache-2.0', 'contribution license SPDX identifier is invalid');
  for (const document of Object.values(policy.documents)) {
    assert(/^[a-f0-9]{64}$/.test(document.sha256), 'document digest is invalid');
  }
  assertExactKeys(
    policy.signoffPolicy,
    ['requireEveryCommitAuthor', 'requireEveryCoauthor', 'identityMatch', 'allowGitHubNoreplyEmail'],
    'policy.signoffPolicy',
  );
  assert(policy.signoffPolicy.requireEveryCommitAuthor === true, 'every commit author must sign off');
  assert(policy.signoffPolicy.requireEveryCoauthor === true, 'every coauthor must sign off');
  assert(policy.signoffPolicy.identityMatch === 'name-and-email-case-insensitive', 'identity matching policy is invalid');
  assert(policy.signoffPolicy.allowGitHubNoreplyEmail === true, 'GitHub noreply email policy is invalid');
  assert(Array.isArray(policy.botExemptions), 'policy.botExemptions must be an array');
  const seenBotIds = new Set();
  for (const [index, exemption] of policy.botExemptions.entries()) {
    const label = `policy.botExemptions[${index}]`;
    assertExactKeys(exemption, ['githubLogin', 'githubUserId', 'reason', 'approvedBy', 'approvedAt'], label);
    assert(exemption.githubLogin.endsWith('[bot]'), `${label}.githubLogin is invalid`);
    assert(/^[1-9][0-9]*$/.test(exemption.githubUserId), `${label}.githubUserId is invalid`);
    assert(!seenBotIds.has(exemption.githubUserId), `${label}.githubUserId is duplicated`);
    seenBotIds.add(exemption.githubUserId);
    assert(typeof exemption.reason === 'string' && exemption.reason.length > 0, `${label}.reason is invalid`);
    assert(typeof exemption.approvedBy === 'string' && exemption.approvedBy.length > 1, `${label}.approvedBy is invalid`);
    assert(isTimestamp(exemption.approvedAt), `${label}.approvedAt is invalid`);
  }
  assertExactKeys(policy.largeOrCorporateContributions, ['threshold', 'action'], 'policy.largeOrCorporateContributions');
  assert(
    policy.largeOrCorporateContributions.threshold === 'maintainer-discretion-for-ownership-complexity-size-or-patent-risk',
    'large contribution threshold is invalid',
  );
  assert(
    policy.largeOrCorporateContributions.action === 'separate-written-agreement-before-merge',
    'large contribution action is invalid',
  );
  assert(Array.isArray(policy.blockers) && policy.blockers.length === 0, 'DCO policy declares blockers');
  return policy;
}

export function getDcoPolicyBlockers(policy, { repositoryRoot = root } = {}) {
  validateDcoPolicy(policy);
  const blockers = [];
  for (const document of Object.values(policy.documents)) {
    const documentPath = path.join(repositoryRoot, document.path);
    if (!fs.existsSync(documentPath) || !fs.statSync(documentPath).isFile()) {
      blockers.push(`document-missing:${document.path}`);
    } else if (sha256(fs.readFileSync(documentPath)) !== document.sha256) {
      blockers.push(`document-digest-mismatch:${document.path}`);
    }
  }
  return blockers;
}

export function evaluateDcoCommits(commits, policy, options = {}) {
  const blockers = getDcoPolicyBlockers(policy, options);
  assert(Array.isArray(commits), 'commits must be an array');
  if (commits.length === 0) blockers.push('pull-request-has-no-commits');
  const checkedCommits = [];
  for (const commit of commits) {
    const reference = String(commit?.sha ?? '').slice(0, 12) || 'unknown';
    const githubAuthor = commit?.author;
    const isBot = githubAuthor?.type === 'Bot' || githubAuthor?.login?.endsWith('[bot]');
    if (isBot) {
      const exemption = policy.botExemptions.find((item) => (
        item.githubUserId === String(githubAuthor.id ?? '') && item.githubLogin === githubAuthor.login
      ));
      if (!exemption) blockers.push(`commit:${reference}:bot-not-exempt`);
      else checkedCommits.push(reference);
      continue;
    }

    const message = commit?.commit?.message;
    const author = commit?.commit?.author;
    if (!author?.name || !author?.email || typeof message !== 'string') {
      blockers.push(`commit:${reference}:author-metadata-missing`);
      continue;
    }
    const signoffs = new Set(trailers(message, 'Signed-off-by').map(({ name, email }) => normalizedIdentity(name, email)));
    if (!signoffs.has(normalizedIdentity(author.name, author.email))) {
      blockers.push(`commit:${reference}:author-signoff-missing-or-mismatched`);
    }
    const coauthors = trailers(message, 'Co-authored-by');
    for (let index = 0; index < coauthors.length; index += 1) {
      const coauthor = coauthors[index];
      if (!signoffs.has(normalizedIdentity(coauthor.name, coauthor.email))) {
        blockers.push(`commit:${reference}:coauthor-${index + 1}-signoff-missing-or-mismatched`);
      }
    }
    checkedCommits.push(reference);
  }
  return { passed: blockers.length === 0, blockers, checkedCommits };
}

function nextPage(link) {
  if (!link) return null;
  const next = link.split(',').find((part) => /rel="next"/.test(part));
  return next?.match(/<([^>]+)>/)?.[1] ?? null;
}

function assertTrustedCommitUrl(value, commitsPath) {
  const url = new URL(value);
  assert(url.origin === 'https://api.github.com' && url.pathname === commitsPath, 'GitHub pagination URL escaped the trusted API endpoint');
  for (const key of url.searchParams.keys()) assert(['page', 'per_page'].includes(key), 'GitHub pagination URL has an unexpected query parameter');
  if (url.searchParams.has('per_page')) assert(url.searchParams.get('per_page') === '100', 'GitHub pagination page size is invalid');
  if (url.searchParams.has('page')) assert(/^[1-9][0-9]*$/.test(url.searchParams.get('page')), 'GitHub pagination page is invalid');
}

export async function collectPullRequestCommits(event, { token, fetchImpl = fetch } = {}) {
  assert(isRecord(event?.pull_request), 'event.pull_request is required');
  assert(isRecord(event?.repository), 'event.repository is required');
  assert(typeof token === 'string' && token.length > 0, 'GITHUB_TOKEN is required');
  assert(event.repository.full_name === trustedRepository, 'event.repository.full_name is invalid');
  assert(event.repository.url === trustedApiRoot, 'event.repository.url is not the trusted GitHub API URL');
  assert(Number.isInteger(event.pull_request.number) && event.pull_request.number > 0, 'event.pull_request.number is invalid');
  const commitsPath = `/repos/${trustedRepository}/pulls/${event.pull_request.number}/commits`;
  let url = `${trustedApiRoot}/pulls/${event.pull_request.number}/commits?per_page=100`;
  const commits = [];
  let pageCount = 0;
  while (url) {
    pageCount += 1;
    assert(pageCount <= 20, 'pull request commit pagination exceeded the safety limit');
    assertTrustedCommitUrl(url, commitsPath);
    const response = await fetchImpl(url, {
      redirect: 'error',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    assert(response.ok, `GitHub commit lookup failed with HTTP ${response.status}`);
    const page = await response.json();
    assert(Array.isArray(page), 'GitHub commit lookup returned an invalid payload');
    commits.push(...page);
    url = nextPage(response.headers.get('link'));
  }
  return commits;
}

async function main() {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const eventIndex = process.argv.indexOf('--event');
  const policyBlockers = getDcoPolicyBlockers(policy);
  if (policyBlockers.length > 0) throw new Error(`DCO policy is blocked:\n- ${policyBlockers.join('\n- ')}`);
  if (eventIndex === -1) {
    process.stdout.write('DCO policy is operational and its document digests match.\n');
    return;
  }
  assert(process.argv[eventIndex + 1], '--event requires a path');
  const event = JSON.parse(fs.readFileSync(process.argv[eventIndex + 1], 'utf8'));
  const commits = await collectPullRequestCommits(event, { token: process.env.GITHUB_TOKEN });
  const result = evaluateDcoCommits(commits, policy);
  if (!result.passed) throw new Error(`DCO sign-off failed:\n- ${result.blockers.join('\n- ')}`);
  process.stdout.write(`DCO sign-off passed for ${result.checkedCommits.length} commit(s).\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
