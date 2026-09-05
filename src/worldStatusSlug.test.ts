import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  statusSlugV1,
  type StatusSlugInput,
} from "../packages/world-shell/src/statusSlug.js";

interface FixtureCase extends StatusSlugInput {
  name: string;
  expected: string;
}

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "contracts/status-slug-v1.json"), "utf8"),
) as { cases: FixtureCase[] };

describe("statusSlugV1", () => {
  it.each(fixture.cases)("matches shared fixture: $name", (testCase) => {
    expect(statusSlugV1(testCase)).toBe(testCase.expected);
  });
});
