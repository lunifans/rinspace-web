import { describe, expect, it } from "vitest";

import { resolveDemoWorldRoute } from "./worldContract";

describe("demo world route contract", () => {
  it("only replaces the demo home when the inner world is explicit", () => {
    expect(resolveDemoWorldRoute("/", "")).toBeNull();
    expect(resolveDemoWorldRoute("/", "?world=inner")).toEqual({
      kind: "inner-home",
      degraded: false,
    });
    expect(
      resolveDemoWorldRoute("/", "?demoState=degraded&world=inner"),
    ).toEqual({
      kind: "inner-home",
      degraded: true,
    });
  });

  it("resolves short, canonical, and incorrect slugs by stable post ID", () => {
    expect(resolveDemoWorldRoute("/p/7001001")?.kind).toBe("post");
    expect(resolveDemoWorldRoute("/p/7001001")).toMatchObject({
      canonicalPath: "/p/7001001/local-first-community-design",
      slugState: "missing",
    });
    expect(
      resolveDemoWorldRoute("/p/7001001/local-first-community-design"),
    ).toMatchObject({
      slugState: "canonical",
    });
    expect(resolveDemoWorldRoute("/p/7001001/wrong-slug")).toMatchObject({
      canonicalPath: "/p/7001001/local-first-community-design",
      slugState: "incorrect",
    });
  });

  it("does not mistake an unknown stable ID for an existing post", () => {
    expect(resolveDemoWorldRoute("/p/9999999/anything")).toMatchObject({
      post: null,
      canonicalPath: null,
      slugState: "not-found",
    });
    expect(resolveDemoWorldRoute("/books")).toBeNull();
  });
});
