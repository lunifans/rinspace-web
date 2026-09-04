import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const contractPath = path.join(projectRoot, 'contracts', 'openapi.yaml');
const rulesPath = path.join(projectRoot, 'contracts', 'uncontracted-endpoint-rules.json');
const generatedTypesPath = path.join(projectRoot, 'src', 'generated', 'api-contract.ts');
const generatedInventoryPath = path.join(projectRoot, 'contracts', 'uncontracted-endpoints.generated.json');
const mode = process.argv.includes('--check') ? 'check' : 'write';
const methods = ['get', 'post', 'put', 'patch', 'delete'];

function fail(message) {
  throw new Error(`API contract generation failed: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${path.relative(projectRoot, file)} is not JSON-compatible YAML: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

const contract = readJson(contractPath);
const rulesConfig = readJson(rulesPath);
if (contract.openapi !== '3.1.0') fail('openapi must be 3.1.0');
if (contract['x-rinspace-contract-version'] !== 'v1') fail('x-rinspace-contract-version must be v1');
if (!contract.components?.schemas || !contract.paths) fail('paths and components.schemas are required');
if (rulesConfig.schemaVersion !== 1 || !Array.isArray(rulesConfig.rules)) fail('invalid uncontracted endpoint rules');

function refName(ref) {
  const prefix = '#/components/schemas/';
  if (typeof ref !== 'string' || !ref.startsWith(prefix)) fail(`unsupported schema ref ${String(ref)}`);
  const name = ref.slice(prefix.length);
  if (!(name in contract.components.schemas)) fail(`missing schema ${name}`);
  return name;
}

function propertyName(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value);
}

function schemaType(schema) {
  if (!schema) return 'never';
  if (schema.$ref) return `ApiSchemas[${JSON.stringify(refName(schema.$ref))}]`;
  if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(' | ') || 'never';
  if (Array.isArray(schema.oneOf)) return schema.oneOf.map(schemaType).join(' | ');
  if (Array.isArray(schema.anyOf)) return schema.anyOf.map(schemaType).join(' | ');
  if (Array.isArray(schema.allOf)) return schema.allOf.map((part) => `(${schemaType(part)})`).join(' & ');
  if (Array.isArray(schema.type)) return schema.type.map((type) => schemaType({ ...schema, type })).join(' | ');
  if (schema.type === 'null') return 'null';
  if (schema.type === 'string') return 'string';
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array') return `(${schemaType(schema.items)})[]`;
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const lines = Object.entries(properties).map(([name, value]) => `    ${propertyName(name)}${required.has(name) ? '' : '?'}: ${schemaType(value)};`);
    if (schema.additionalProperties === true) lines.push('    readonly [key: string]: unknown;');
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      lines.push(`    readonly [key: string]: ${schemaType(schema.additionalProperties)};`);
    }
    return lines.length > 0 ? `{\n${lines.join('\n')}\n  }` : 'Readonly<Record<string, unknown>>';
  }
  fail(`unsupported schema ${JSON.stringify(schema)}`);
}

function resolveResponse(response) {
  if (!response?.$ref) return response;
  const prefix = '#/components/responses/';
  if (!response.$ref.startsWith(prefix)) fail(`unsupported response ref ${response.$ref}`);
  const resolved = contract.components.responses?.[response.$ref.slice(prefix.length)];
  if (!resolved) fail(`missing response ${response.$ref}`);
  return resolved;
}

function contentSchema(container) {
  return container?.content?.['application/json']?.schema;
}

const operationIds = new Set();
const operations = [];
for (const [apiPath, pathItem] of Object.entries(contract.paths)) {
  for (const method of methods) {
    const operation = pathItem[method];
    if (!operation) continue;
    if (!operation.operationId || operationIds.has(operation.operationId)) fail(`missing or duplicate operationId at ${method.toUpperCase()} ${apiPath}`);
    operationIds.add(operation.operationId);
    const auth = operation['x-rinspace-auth'];
    if (!['none', 'optional', 'required'].includes(auth)) fail(`invalid auth mode for ${operation.operationId}`);
    if (!operation.responses?.default) fail(`default error response is required for ${operation.operationId}`);
    const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
    const queryProperties = Object.fromEntries(parameters.filter((parameter) => parameter.in === 'query').map((parameter) => [parameter.name, parameter.schema]));
    const queryRequired = parameters.filter((parameter) => parameter.in === 'query' && parameter.required).map((parameter) => parameter.name);
    const pathProperties = Object.fromEntries(parameters.filter((parameter) => parameter.in === 'path').map((parameter) => [parameter.name, parameter.schema]));
    const pathRequired = parameters.filter((parameter) => parameter.in === 'path').map((parameter) => parameter.name);
    const successCode = Object.keys(operation.responses).find((code) => /^2\d\d$/.test(code));
    if (!successCode) fail(`success response is required for ${operation.operationId}`);
    operations.push({
      id: operation.operationId,
      method: method.toUpperCase(),
      path: apiPath,
      auth,
      pathParameters: { type: 'object', properties: pathProperties, required: pathRequired, additionalProperties: false },
      query: { type: 'object', properties: queryProperties, required: queryRequired, additionalProperties: false },
      request: contentSchema(operation.requestBody),
      response: contentSchema(resolveResponse(operation.responses[successCode])),
    });
  }
}

const schemaLines = Object.entries(contract.components.schemas).map(([name, schema]) => `  readonly ${propertyName(name)}: ${schemaType(schema)};`);
const operationLines = operations.map((operation) => `  readonly ${propertyName(operation.id)}: {\n    readonly method: ${JSON.stringify(operation.method)};\n    readonly path: ${JSON.stringify(operation.path)};\n    readonly auth: ${JSON.stringify(operation.auth)};\n    readonly pathParameters: ${schemaType(operation.pathParameters)};\n    readonly query: ${schemaType(operation.query)};\n    readonly requestBody: ${schemaType(operation.request)};\n    readonly response: ${schemaType(operation.response)};\n    readonly error: ApiSchemas["ErrorResponse"];\n  };`);
const generatedTypes = `/* This file is generated by scripts/generate-api-contract.mjs. Do not edit. */\n\nexport const RINSPACE_API_CONTRACT_VERSION = ${JSON.stringify(contract['x-rinspace-contract-version'])} as const;\n\nexport type ApiAuthMode = 'none' | 'optional' | 'required';\n\nexport type ApiSchemas = {\n${schemaLines.join('\n')}\n};\n\nexport type ApiOperations = {\n${operationLines.join('\n')}\n};\n\nexport type ApiOperationId = keyof ApiOperations;\nexport type ApiCapabilityName = ApiSchemas['CapabilityName'];\nexport type ApiErrorResponse = ApiSchemas['ErrorResponse'];\n`;

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name) ? [absolute] : [];
  });
}

const discovered = new Map();
for (const absolute of sourceFiles(path.join(projectRoot, 'src'))) {
  const source = fs.readFileSync(absolute, 'utf8');
  const sourcePath = path.relative(projectRoot, absolute).split(path.sep).join('/');
  const endpointPattern = /const\s+([A-Za-z0-9_]+Endpoint)\s*=\s*`\$\{publicEnv\.publicBasePath(?:\s*\|\|\s*(?:""|''))?\}(\/api\/[^`$?]+)/g;
  for (const match of source.matchAll(endpointPattern)) discovered.set(match[2], { source: sourcePath, symbol: match[1] });
  const requestPattern = /request(Json|AdminJson|Text)(?:<[^>]+>)?\(\s*["']([^"'`]+)["']/g;
  for (const match of source.matchAll(requestPattern)) {
    const apiPath = `${match[1] === 'AdminJson' ? '/admin/api/' : '/api/'}${match[2].replace(/^\/+/, '')}`;
    if (!discovered.has(apiPath)) discovered.set(apiPath, { source: sourcePath, symbol: `request${match[1]}` });
  }
  const annotationPattern = /@rinspace-api-path\s+(\/(?:admin\/)?api\/[A-Za-z0-9_./{}-]+)/g;
  for (const match of source.matchAll(annotationPattern)) {
    if (!discovered.has(match[1])) discovered.set(match[1], { source: sourcePath, symbol: 'dynamicPathAnnotation' });
  }
}

const contractedExactPaths = new Set(Object.keys(contract.paths).filter((apiPath) => !apiPath.includes('{')));
const inventory = [...discovered.entries()]
  .filter(([apiPath]) => !contractedExactPaths.has(apiPath))
  .map(([apiPath, location]) => {
    const rule = rulesConfig.rules.find((candidate) => apiPath.startsWith(candidate.prefix));
    if (!rule) fail(`unowned endpoint ${apiPath}`);
    return { path: apiPath, ...location, owner: rule.owner, targetTask: rule.targetTask };
  })
  .sort((left, right) => left.path.localeCompare(right.path));
const generatedInventory = `${JSON.stringify({
  schemaVersion: 1,
  generatedFrom: ['contracts/openapi.yaml', 'contracts/uncontracted-endpoint-rules.json', 'src/**/*.{ts,tsx}'],
  count: inventory.length,
  endpoints: inventory,
}, null, 2)}\n`;

function emit(file, value) {
  if (mode === 'check') {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== value) fail(`${path.relative(projectRoot, file)} is stale; run pnpm generate:api-contract`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

emit(generatedTypesPath, generatedTypes);
emit(generatedInventoryPath, generatedInventory);
process.stdout.write(`API contract ${mode} passed: ${operations.length} operations, ${Object.keys(contract.components.schemas).length} schemas, ${inventory.length} uncontracted endpoints.\n`);
