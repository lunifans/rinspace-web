import fs from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(
  import.meta.dirname,
  "../packages/world-shell",
);
const source = path.join(packageRoot, "src/styles.css");
const destination = path.join(packageRoot, "dist/styles.css");

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
process.stdout.write("Copied @rinspace/world-shell CSS asset.\n");
