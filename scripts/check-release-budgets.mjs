import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const budgets = JSON.parse(
  fs.readFileSync(path.join(root, "config/release-budgets.json"), "utf8"),
);
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []),
);
const failures = [];

function fileTree(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  const result = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile())
        result.push({ absolute, bytes: fs.statSync(absolute).size });
      else
        failures.push(
          `${path.relative(root, absolute)}: release tree contains a non-regular file`,
        );
    }
  }
  visit(directory);
  return result;
}

function sum(files, predicate = () => true) {
  return files
    .filter((file) => predicate(file.absolute))
    .reduce((total, file) => total + file.bytes, 0);
}

const datasetPath = path.join(root, "src/demo/fixtures/v1/dataset.json");
const manifestPath = path.join(
  root,
  "src/demo/fixtures/v1/seed-manifest.generated.json",
);
const datasetBytes = fs.statSync(datasetPath).size;
const seed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (datasetBytes > budgets.demoSeed.maximumSourceBytes)
  failures.push(
    `demo dataset ${datasetBytes} > ${budgets.demoSeed.maximumSourceBytes} bytes`,
  );
for (const [key, maximum] of [
  ["entities", budgets.demoSeed.maximumEntities],
  ["relations", budgets.demoSeed.maximumRelations],
  ["blobs", budgets.demoSeed.maximumAssets],
]) {
  if (seed.counts[key] > maximum)
    failures.push(`demo ${key} ${seed.counts[key]} > ${maximum}`);
}

const screenshotFiles = fileTree(
  path.join(root, "docs/assets/screenshots"),
).filter((file) => file.absolute.endsWith(".png"));
const screenshotBytes = sum(screenshotFiles);
if (screenshotBytes > budgets.screenshots.maximumTotalBytes)
  failures.push(
    `screenshots ${screenshotBytes} > ${budgets.screenshots.maximumTotalBytes} bytes`,
  );
for (const file of screenshotFiles) {
  if (file.bytes > budgets.screenshots.maximumFileBytes)
    failures.push(
      `${path.relative(root, file.absolute)} ${file.bytes} > ${budgets.screenshots.maximumFileBytes} bytes`,
    );
}

const coreDirectory = args.core ? path.resolve(root, args.core) : null;
const coreFiles = fileTree(coreDirectory);
if (coreFiles.length) {
  const total = sum(coreFiles);
  const javascript = sum(coreFiles, (file) => /\.(?:c|m)?js$/.test(file));
  const css = sum(coreFiles, (file) => file.endsWith(".css"));
  if (total > budgets.core.maximumBytes)
    failures.push(`core ${total} > ${budgets.core.maximumBytes} bytes`);
  if (javascript > budgets.core.maximumJavaScriptBytes)
    failures.push(
      `core JavaScript ${javascript} > ${budgets.core.maximumJavaScriptBytes} bytes`,
    );
  if (css > budgets.core.maximumCssBytes)
    failures.push(`core CSS ${css} > ${budgets.core.maximumCssBytes} bytes`);
  for (const file of coreFiles) {
    if (file.bytes > budgets.core.maximumSingleFileBytes)
      failures.push(
        `${path.relative(root, file.absolute)} ${file.bytes} > ${budgets.core.maximumSingleFileBytes} bytes`,
      );
  }
}

const packageDirectory = args.package ? path.resolve(root, args.package) : null;
const packageFiles = fileTree(packageDirectory);
if (packageFiles.length && sum(packageFiles) > budgets.package.maximumBytes) {
  failures.push(
    `static package ${sum(packageFiles)} > ${budgets.package.maximumBytes} bytes`,
  );
}

if (failures.length)
  throw new Error(
    `Release budgets failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
  );
process.stdout.write(
  `Release budgets passed: seed=${datasetBytes} bytes/${seed.counts.entities} entities, screenshots=${screenshotBytes} bytes, core=${sum(coreFiles)} bytes, package=${sum(packageFiles)} bytes.\n`,
);
