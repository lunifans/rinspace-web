import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourcePath = path.join(root, 'src/demo/fixtures/v1/dataset.json');
const outputPath = path.join(root, 'src/demo/fixtures/v1/seed-manifest.generated.json');
const write = process.argv.includes('--write');
const document = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const failures = [];

function invariant(condition, message) {
  if (!condition) failures.push(message);
}

function uniqueMap(records, label) {
  const result = new Map();
  for (const record of records) {
    invariant(typeof record.key === 'string' && record.key.length > 0, `${label} has an empty key`);
    invariant(!result.has(record.key), `${label} has duplicate key ${record.key}`);
    result.set(record.key, record);
  }
  return result;
}

function canonicalJson(value) {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('Fixture contains a non-serializable value.');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sortedByKey(records) {
  return [...records].sort((left, right) => left.key.localeCompare(right.key));
}

invariant(document.schemaVersion === 1, 'fixture schemaVersion must be 1');
invariant(document.datasetVersion === 'rinspace-demo-v1', 'fixture datasetVersion must be rinspace-demo-v1');
invariant(document.provenance?.contentOrigin === 'rinspace-created-synthetic', 'fixture provenance must be synthetic');
invariant(document.provenance?.containsProductionData === false, 'fixture cannot contain production data');
invariant(document.provenance?.containsRealPersonalData === false, 'fixture cannot contain real personal data');
invariant(document.license?.status === 'approved-task-4', 'fixture license status must record the approved Task 4 decision');
invariant(document.license?.candidateSpdx === 'CC0-1.0', 'fixture candidate license must remain CC0-1.0');
invariant(document.license?.effectiveSpdx === 'CC0-1.0', 'fixture effective license must be CC0-1.0');
invariant(document.license?.distributionApproved === true, 'fixture distribution must record the approved Task 4 decision');

for (const key of ['entities', 'relations', 'drafts', 'assets', 'preferences']) {
  invariant(Array.isArray(document[key]), `${key} must be an array`);
}
if (failures.length) throw new Error(failures.join('\n'));

const entitiesByKey = uniqueMap(document.entities, 'entities');
const entitiesById = new Map();
for (const entity of document.entities) {
  invariant(/^demo-[a-z0-9-]+$/.test(entity.id), `entity id is not synthetic: ${entity.id}`);
  invariant(entity.key === `${entity.kind}:${entity.id}`, `entity key does not match kind/id: ${entity.key}`);
  invariant(!entitiesById.has(entity.id), `duplicate entity id ${entity.id}`);
  entitiesById.set(entity.id, entity);
}
uniqueMap(document.relations, 'relations');
uniqueMap(document.drafts, 'drafts');
const assetsByKey = uniqueMap(document.assets, 'assets');
uniqueMap(document.preferences, 'preferences');

const users = document.entities.filter((entity) => entity.kind === 'user');
const contents = document.entities.filter((entity) => entity.kind === 'content');
const tags = document.entities.filter((entity) => entity.kind === 'tag');
const comments = document.entities.filter((entity) => entity.kind === 'comment');
const notifications = document.entities.filter((entity) => entity.kind === 'notification');
const userIds = new Set(users.map((entity) => entity.id));
const contentIds = new Set(contents.map((entity) => entity.id));
const tagIds = new Set(tags.map((entity) => entity.id));

function assetKey(reference) {
  return typeof reference === 'string' && reference.startsWith('demo-asset:')
    ? reference.slice('demo-asset:'.length)
    : reference;
}

for (const user of users) {
  invariant(userIds.has(user.id), `unknown user ${user.id}`);
  if (user.data.avatarUrl !== null) {
    invariant(assetsByKey.has(assetKey(user.data.avatarUrl)), `user avatar is missing: ${user.id}`);
  }
}

const declaredTagPairs = new Set();
for (const content of contents) {
  invariant(userIds.has(content.data.authorId), `content author is missing: ${content.id}`);
  invariant(content.data.status !== 'published' || content.data.publishedAt !== null, `published content has no publishedAt: ${content.id}`);
  for (const tagId of content.data.tags) {
    invariant(tagIds.has(tagId), `content tag is missing: ${content.id}/${tagId}`);
    declaredTagPairs.add(`${tagId}->${content.id}`);
  }
  if (content.data.coverAssetKey !== null) {
    invariant(assetsByKey.has(content.data.coverAssetKey), `content cover is missing: ${content.id}`);
  }
  for (const attachment of content.data.attachmentKeys) {
    invariant(assetsByKey.has(attachment), `content attachment is missing: ${content.id}/${attachment}`);
  }
}

for (const comment of comments) {
  invariant(contentIds.has(comment.data.targetId), `comment target is missing: ${comment.id}`);
  invariant(userIds.has(comment.data.authorId), `comment author is missing: ${comment.id}`);
}

for (const notification of notifications) {
  invariant(userIds.has(notification.data.actorId), `notification actor is missing: ${notification.id}`);
  const targetExists = notification.data.targetType === 'user'
    ? userIds.has(notification.data.targetId)
    : notification.data.targetType === 'content'
      ? contentIds.has(notification.data.targetId)
      : document.entities.some((entity) => entity.kind === 'comment' && entity.id === notification.data.targetId);
  invariant(targetExists, `notification target is missing: ${notification.id}`);
}

const relationTagPairs = new Set();
for (const relation of document.relations) {
  const source = entitiesById.get(relation.sourceId);
  const target = entitiesById.get(relation.targetId);
  invariant(source?.kind === relation.sourceKind, `relation source is missing or wrong kind: ${relation.key}`);
  invariant(target?.kind === relation.targetKind, `relation target is missing or wrong kind: ${relation.key}`);
  if (relation.kind === 'tag-content') relationTagPairs.add(`${relation.sourceId}->${relation.targetId}`);
}
invariant(
  JSON.stringify([...declaredTagPairs].sort()) === JSON.stringify([...relationTagPairs].sort()),
  'content tags and tag-content relations must describe the same graph',
);

for (const draft of document.drafts) {
  invariant(userIds.has(draft.ownerId), `draft owner is missing: ${draft.key}`);
  invariant(draft.updatedAt >= draft.createdAt, `draft timestamps are reversed: ${draft.key}`);
}

const contentTypes = new Set(contents.map((entity) => entity.data.type));
for (const required of ['blog', 'book', 'discussion', 'dynamic', 'question']) {
  invariant(contentTypes.has(required), `fixture lacks required content type ${required}`);
}
invariant(!contentTypes.has('announcement'), 'announcements must remain a declared empty state');
invariant(new Set(users.map((entity) => entity.data.locale)).size === 2, 'fixture users must cover both locales');
invariant(contents.some((entity) => entity.data.body.length >= 1_500), 'fixture lacks a representative long-form body');
invariant(contents.some((entity) => /```/.test(entity.data.body)), 'fixture lacks fenced code');
invariant(contents.some((entity) => /\$[^$]+\$/.test(entity.data.body)), 'fixture lacks LaTeX math');
invariant(contents.some((entity) => entity.data.title.length >= 80), 'fixture lacks a mobile long-title edge');
invariant(contents.some((entity) => /[A-Za-z0-9]{40,}/.test(entity.data.body)), 'fixture lacks an unbroken mobile token edge');
invariant(document.declaredEmptyStates.includes('announcements'), 'fixture must declare the announcements empty state');
invariant(document.declaredEmptyStates.includes('search-no-results'), 'fixture must declare a search empty state');

let scannedFields = 0;
const privacyFindings = [];
const prohibitedKey = /(?:phone|e-?mail|real.?name|website|password|secret|token|production.?id)/i;
const emailValue = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phoneValue = /(?:\+?86[- ]?)?1[3-9]\d{9}/;
const remoteUrl = /https?:\/\/[^\s"'<>]+/gi;

function scan(value, fieldPath = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${fieldPath}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (prohibitedKey.test(key)) privacyFindings.push(`${fieldPath}.${key}: prohibited field`);
      scan(item, `${fieldPath}.${key}`);
    }
    return;
  }
  scannedFields += 1;
  if (typeof value !== 'string') return;
  if (emailValue.test(value)) privacyFindings.push(`${fieldPath}: email-shaped value`);
  if (phoneValue.test(value)) privacyFindings.push(`${fieldPath}: phone-shaped value`);
  for (const match of value.matchAll(remoteUrl)) {
    if (match[0] !== 'http://www.w3.org/2000/svg') privacyFindings.push(`${fieldPath}: remote URL`);
  }
  if (/rinspace\.com|cloudbase|tcloudbasegateway|github\.com\/lunifans/i.test(value)) {
    privacyFindings.push(`${fieldPath}: production-bound value`);
  }
}
scan(document);
invariant(privacyFindings.length === 0, `privacy scan failed: ${privacyFindings.join(', ')}`);

const assetDigests = Object.fromEntries(sortedByKey(document.assets).map((asset) => {
  invariant(asset.provenance === 'rinspace-created-original', `asset provenance is not original: ${asset.key}`);
  invariant(asset.licenseRef === 'LicenseRef-Rinspace-Demo-Data-Pending', `asset license boundary drifted: ${asset.key}`);
  invariant(!/<script\b|\b(?:href|src)=["']https?:/i.test(asset.text), `asset contains executable or remote content: ${asset.key}`);
  return [asset.key, `sha256:${sha256(Buffer.from(asset.text))}`];
}));

if (failures.length) throw new Error(failures.join('\n'));

const canonicalBlobs = sortedByKey(document.assets).map((asset) => ({
  key: asset.key,
  name: asset.name,
  type: asset.type,
  createdAt: asset.createdAt,
  size: Buffer.byteLength(asset.text),
  sha256: assetDigests[asset.key].slice('sha256:'.length),
}));
const seedPayload = {
  datasetVersion: document.datasetVersion,
  entities: sortedByKey(document.entities),
  relations: sortedByKey(document.relations),
  drafts: sortedByKey(document.drafts),
  blobs: canonicalBlobs,
  preferences: sortedByKey(document.preferences),
};
const checksum = `sha256:${sha256(canonicalJson(seedPayload))}`;
const generated = `${JSON.stringify({
  schemaVersion: 1,
  datasetVersion: document.datasetVersion,
  fixedNow: document.fixedNow,
  checksum,
  source: 'src/demo/fixtures/v1/dataset.json',
  counts: {
    entities: document.entities.length,
    users: users.length,
    contents: contents.length,
    tags: tags.length,
    comments: comments.length,
    notifications: notifications.length,
    relations: document.relations.length,
    drafts: document.drafts.length,
    blobs: document.assets.length,
    preferences: document.preferences.length,
  },
  features: {
    locales: [...new Set(document.entities.map((entity) => entity.data.locale).filter(Boolean))].sort(),
    contentTypes: [...contentTypes].sort(),
    declaredEmptyStates: [...document.declaredEmptyStates].sort(),
    markdown: true,
    latex: true,
    code: true,
    longForm: true,
    mobileEdges: true,
  },
  provenance: document.provenance,
  license: document.license,
  privacy: {
    scannedFields,
    findings: privacyFindings.length,
    externalUrls: 0,
  },
  assetDigests,
}, null, 2)}\n`;

if (write) {
  fs.writeFileSync(outputPath, generated);
  process.stdout.write(`Wrote ${path.relative(root, outputPath)} (${checksum}).\n`);
} else {
  invariant(fs.existsSync(outputPath), 'generated seed manifest is missing');
  if (fs.existsSync(outputPath)) {
    invariant(fs.readFileSync(outputPath, 'utf8') === generated, 'generated seed manifest is stale; run pnpm generate:demo-seed');
  }
  if (failures.length) throw new Error(failures.join('\n'));
  process.stdout.write(`Demo seed manifest passed: ${document.entities.length} entities, ${document.relations.length} relations, ${document.assets.length} assets, ${checksum}.\n`);
}
