import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'config/cla-registry.json');
const expectedPublicFields = [
  'githubLogin',
  'githubUserId',
  'agreementType',
  'agreementSha256',
  'privacyNoticeSha256',
  'acceptedAt',
  'evidenceRef',
];
const operationalEvidenceKeys = [
  'signingIntake',
  'privateRecordStore',
  'encryptedBackup',
  'crossBorderControl',
  'branchProtection',
];
const agreementDefinitions = {
  individual: { path: 'ICLA.md' },
  corporate: { path: 'CCLA.md' },
  privacyNotice: { path: 'CLA-PRIVACY.md' },
};

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

export function validateClaRegistry(registry) {
  assertExactKeys(registry, [
    '$schema',
    'schemaVersion',
    'status',
    'repository',
    'agreements',
    'publicRegistryFields',
    'records',
    'botExemptions',
    'operationalEvidence',
    'blockers',
  ], 'registry');
  assert(registry.$schema === '../schemas/cla-registry.schema.json', 'registry.$schema is invalid');
  assert(registry.schemaVersion === 1, 'registry.schemaVersion is invalid');
  assert(['disabled', 'operational'].includes(registry.status), 'registry.status is invalid');
  assert(registry.repository === 'lunifans/rinspace-web', 'registry.repository is invalid');
  assertExactKeys(registry.agreements, Object.keys(agreementDefinitions), 'registry.agreements');
  for (const [name, definition] of Object.entries(agreementDefinitions)) {
    const agreement = registry.agreements[name];
    assertExactKeys(agreement, ['path', 'version', 'sha256'], `registry.agreements.${name}`);
    assert(agreement.path === definition.path, `registry.agreements.${name}.path is invalid`);
    assert(agreement.version === '1.0', `registry.agreements.${name}.version is invalid`);
    assert(/^[a-f0-9]{64}$/.test(agreement.sha256), `registry.agreements.${name}.sha256 is invalid`);
  }
  assert(
    JSON.stringify(registry.publicRegistryFields) === JSON.stringify(expectedPublicFields),
    'registry.publicRegistryFields must remain minimal and ordered',
  );
  assert(Array.isArray(registry.records), 'registry.records must be an array');
  assert(Array.isArray(registry.botExemptions), 'registry.botExemptions must be an array');
  assertExactKeys(registry.operationalEvidence, operationalEvidenceKeys, 'registry.operationalEvidence');
  for (const [key, value] of Object.entries(registry.operationalEvidence)) {
    assert(value === null || /^evidence:[A-Za-z0-9._/-]+$/.test(value), `registry.operationalEvidence.${key} is invalid`);
  }
  assert(Array.isArray(registry.blockers), 'registry.blockers must be an array');
  assert(registry.blockers.every((value) => typeof value === 'string' && value.length > 0), 'registry.blockers is invalid');

  const seenUserIds = new Set();
  for (const [index, record] of registry.records.entries()) {
    const label = `registry.records[${index}]`;
    assertExactKeys(record, [
      'githubLogin',
      'githubUserId',
      'agreementType',
      'agreementSha256',
      'privacyNoticeSha256',
      'acceptedAt',
      'evidenceRef',
    ], label);
    assert(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(record.githubLogin), `${label}.githubLogin is invalid`);
    assert(/^[1-9][0-9]*$/.test(record.githubUserId), `${label}.githubUserId is invalid`);
    assert(!seenUserIds.has(record.githubUserId), `${label}.githubUserId is duplicated`);
    seenUserIds.add(record.githubUserId);
    assert(['individual', 'corporate'].includes(record.agreementType), `${label}.agreementType is invalid`);
    assert(record.agreementSha256 === registry.agreements[record.agreementType].sha256, `${label}.agreementSha256 is stale`);
    assert(record.privacyNoticeSha256 === registry.agreements.privacyNotice.sha256, `${label}.privacyNoticeSha256 is stale`);
    assert(isTimestamp(record.acceptedAt), `${label}.acceptedAt is invalid`);
    assert(Date.parse(record.acceptedAt) <= Date.now() + 300_000, `${label}.acceptedAt is in the future`);
    assert(/^private-cla-record:[A-Za-z0-9._-]+$/.test(record.evidenceRef), `${label}.evidenceRef is invalid`);
  }

  const seenBots = new Set();
  for (const [index, exemption] of registry.botExemptions.entries()) {
    const label = `registry.botExemptions[${index}]`;
    assertExactKeys(exemption, ['githubLogin', 'githubUserId', 'reason', 'approvedBy', 'approvedAt'], label);
    assert(typeof exemption.githubLogin === 'string' && exemption.githubLogin.endsWith('[bot]'), `${label}.githubLogin must identify a bot`);
    assert(/^[1-9][0-9]*$/.test(exemption.githubUserId), `${label}.githubUserId is invalid`);
    assert(!seenBots.has(exemption.githubUserId), `${label}.githubUserId is duplicated`);
    seenBots.add(exemption.githubUserId);
    assert(typeof exemption.reason === 'string' && exemption.reason.length > 0, `${label}.reason is invalid`);
    assert(typeof exemption.approvedBy === 'string' && exemption.approvedBy.length > 0, `${label}.approvedBy is invalid`);
    assert(isTimestamp(exemption.approvedAt), `${label}.approvedAt is invalid`);
  }
  return registry;
}

export function getClaRegistryBlockers(registry, { repositoryRoot = root } = {}) {
  validateClaRegistry(registry);
  const blockers = [];
  for (const [name, definition] of Object.entries(agreementDefinitions)) {
    const documentPath = path.join(repositoryRoot, definition.path);
    if (!fs.existsSync(documentPath) || !fs.statSync(documentPath).isFile()) {
      blockers.push(`agreement-document-missing:${definition.path}`);
      continue;
    }
    if (sha256(fs.readFileSync(documentPath)) !== registry.agreements[name].sha256) {
      blockers.push(`agreement-document-digest-mismatch:${definition.path}`);
    }
  }
  if (registry.status !== 'operational') blockers.push('registry-not-operational');
  if (registry.status === 'operational') {
    for (const key of operationalEvidenceKeys) {
      if (registry.operationalEvidence[key] === null) blockers.push(`operational-evidence-missing:${key}`);
    }
    if (registry.blockers.length > 0) blockers.push('operational-registry-declares-blockers');
  } else if (registry.blockers.length === 0) {
    blockers.push('disabled-registry-must-explain-blockers');
  }
  return blockers;
}

export function evaluateContributorCoverage(contributors, registry, options = {}) {
  const blockers = getClaRegistryBlockers(registry, options);
  const coveredUserIds = [];
  const seen = new Set();
  for (const contributor of contributors) {
    if (contributor.unresolved) {
      blockers.push(`unresolved-contributor:${contributor.reference}`);
      continue;
    }
    const githubUserId = String(contributor.githubUserId ?? '');
    if (!/^[1-9][0-9]*$/.test(githubUserId) || seen.has(githubUserId)) continue;
    seen.add(githubUserId);
    const isBot = contributor.type === 'Bot' || contributor.githubLogin?.endsWith('[bot]');
    if (isBot) {
      const exemption = registry.botExemptions.find((item) => item.githubUserId === githubUserId);
      if (!exemption) blockers.push(`bot-not-exempt:${githubUserId}`);
      else coveredUserIds.push(githubUserId);
      continue;
    }
    const record = registry.records.find((item) => item.githubUserId === githubUserId);
    if (!record) blockers.push(`cla-record-missing:${githubUserId}`);
    else coveredUserIds.push(githubUserId);
  }
  return { passed: blockers.length === 0, blockers, coveredUserIds };
}

function parseNextPage(link) {
  if (!link) return null;
  const next = link.split(',').find((part) => /rel="next"/.test(part));
  return next?.match(/<([^>]+)>/)?.[1] ?? null;
}

export async function collectPullRequestContributors(event, { token, fetchImpl = fetch } = {}) {
  assert(isRecord(event?.pull_request), 'event.pull_request is required');
  assert(isRecord(event?.repository), 'event.repository is required');
  assert(typeof token === 'string' && token.length > 0, 'GITHUB_TOKEN is required');
  assert(event.repository.full_name === 'lunifans/rinspace-web', 'event.repository.full_name is invalid');
  assert(Number.isInteger(event.pull_request.number) && event.pull_request.number > 0, 'event.pull_request.number is invalid');
  const repositoryApiUrl = 'https://api.github.com/repos/lunifans/rinspace-web';
  assert(event.repository.url === repositoryApiUrl, 'event.repository.url is not the trusted GitHub API URL');
  const contributors = [];
  const pullRequestAuthor = event.pull_request.user;
  if (pullRequestAuthor?.id && pullRequestAuthor?.login) {
    contributors.push({
      githubUserId: String(pullRequestAuthor.id),
      githubLogin: pullRequestAuthor.login,
      type: pullRequestAuthor.type,
      reference: 'pull-request-author',
    });
  } else {
    contributors.push({ unresolved: true, reference: 'pull-request-author' });
  }

  const commitsPath = `/repos/lunifans/rinspace-web/pulls/${event.pull_request.number}/commits`;
  let url = `${repositoryApiUrl}/pulls/${event.pull_request.number}/commits?per_page=100`;
  let pageCount = 0;
  while (url) {
    pageCount += 1;
    assert(pageCount <= 20, 'pull request commit pagination exceeded the safety limit');
    const parsedUrl = new URL(url);
    assert(parsedUrl.origin === 'https://api.github.com' && parsedUrl.pathname === commitsPath, 'GitHub pagination URL escaped the trusted API endpoint');
    const response = await fetchImpl(url, {
      redirect: 'error',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    assert(response.ok, `GitHub commit lookup failed with HTTP ${response.status}`);
    const commits = await response.json();
    assert(Array.isArray(commits), 'GitHub commit lookup returned an invalid payload');
    for (const commit of commits) {
      const reference = `commit:${String(commit.sha ?? '').slice(0, 12) || 'unknown'}`;
      if (commit.author?.id && commit.author?.login) {
        contributors.push({
          githubUserId: String(commit.author.id),
          githubLogin: commit.author.login,
          type: commit.author.type,
          reference,
        });
      } else {
        contributors.push({ unresolved: true, reference });
      }
      const coauthorCount = (commit.commit?.message?.match(/^Co-authored-by:/gim) ?? []).length;
      for (let index = 0; index < coauthorCount; index += 1) {
        contributors.push({ unresolved: true, reference: `${reference}:coauthor-${index + 1}` });
      }
    }
    url = parseNextPage(response.headers.get('link'));
  }
  return contributors;
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const expectDisabled = process.argv.includes('--expect-disabled');
  const eventIndex = process.argv.indexOf('--event');
  const registryBlockers = getClaRegistryBlockers(registry);

  if (expectDisabled) {
    assert(registry.status === 'disabled', 'CLA registry is unexpectedly operational');
    assert(registryBlockers.includes('registry-not-operational'), 'disabled registry did not fail closed');
    process.stdout.write(`CLA registry is safely disabled (${registry.blockers.length} declared blockers).\n`);
    return;
  }

  if (eventIndex === -1) {
    if (registryBlockers.length > 0) throw new Error(`CLA registry is blocked:\n- ${registryBlockers.join('\n- ')}`);
    process.stdout.write('CLA registry is operational and document digests match.\n');
    return;
  }

  assert(process.argv[eventIndex + 1], '--event requires a path');
  if (registryBlockers.length > 0) throw new Error(`CLA check is disabled or incomplete:\n- ${registryBlockers.join('\n- ')}`);
  const event = JSON.parse(fs.readFileSync(process.argv[eventIndex + 1], 'utf8'));
  const contributors = await collectPullRequestContributors(event, { token: process.env.GITHUB_TOKEN });
  const result = evaluateContributorCoverage(contributors, registry);
  if (!result.passed) throw new Error(`CLA coverage failed:\n- ${result.blockers.join('\n- ')}`);
  process.stdout.write(`CLA coverage passed for ${result.coveredUserIds.length} contributor identity record(s).\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
