import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const privateRehearsalChecks = Object.freeze([
  'cleanClone',
  'readmeQuickStart',
  'releaseReadiness',
  'sourcePolicy',
  'unitCoverage',
  'rootSubpathPackages',
  'browserMatrix',
  'mobileThemesMotionA11y',
  'networkFailClosed',
  'containerCompose',
  'staticHostPreview',
  'sourceHistoryScan',
  'releaseAttachments',
  'containerLayers',
  'sbom',
  'actionsLogs',
  'screenshots',
  'rollbackDemoData',
]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has missing or unexpected fields.`);
  }
}

export function validatePrivateReleaseRehearsal(value, expected = {}) {
  exactKeys(value, [
    'schemaVersion',
    'repository',
    'repositoryVisibility',
    'commit',
    'tag',
    'previousTag',
    'checks',
    'verifiedAt',
  ], 'Private release rehearsal');
  if (value.schemaVersion !== 1 || value.repository !== 'rinspacehq/rinspace-web' || value.repositoryVisibility !== 'private') {
    throw new Error('Rehearsal must target the canonical repository while it is private.');
  }
  if (!/^[0-9a-f]{40}$/.test(value.commit)) throw new Error('Rehearsal commit must be a lowercase full commit.');
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(value.tag) || !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(value.previousTag) || value.tag === value.previousTag) {
    throw new Error('Rehearsal requires distinct immutable candidate and previous tags.');
  }
  if (expected.commit && value.commit !== expected.commit) throw new Error('Rehearsal commit does not match the requested candidate.');
  if (expected.tag && value.tag !== expected.tag) throw new Error('Rehearsal tag does not match the requested candidate.');
  if (expected.previousTag && value.previousTag !== expected.previousTag) throw new Error('Rehearsal previous tag does not match the requested rollback release.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.verifiedAt) || Number.isNaN(Date.parse(value.verifiedAt))) {
    throw new Error('Rehearsal verifiedAt must be a UTC RFC 3339 timestamp.');
  }
  exactKeys(value.checks, privateRehearsalChecks, 'Private release rehearsal checks');
  for (const name of privateRehearsalChecks) {
    exactKeys(value.checks[name], ['status', 'reference'], `Private release rehearsal check ${name}`);
    if (value.checks[name].status !== 'passed' || typeof value.checks[name].reference !== 'string' || value.checks[name].reference.trim().length < 3) {
      throw new Error(`Private release rehearsal check ${name} is not passing with evidence.`);
    }
  }
  return Object.freeze(value);
}

function option(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} is required.`);
  return value;
}

function run() {
  const evidence = path.resolve(option('--evidence'));
  const value = validatePrivateReleaseRehearsal(JSON.parse(fs.readFileSync(evidence, 'utf8')), {
    commit: option('--commit'),
    tag: option('--tag'),
    previousTag: option('--previous-tag'),
  });
  process.stdout.write(`Validated private release rehearsal ${value.tag} at ${value.commit}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) run();
