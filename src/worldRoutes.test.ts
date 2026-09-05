import {
  currentWorldHome,
  flipTarget,
  hrefInWorld,
  resolveWorld,
} from "../packages/world-shell/src";
import { describe, expect, it } from "vitest";

describe("Rinspace world route resolution", () => {
  it("uses an omitted query for outer and world=inner for dual pages", () => {
    const outer = resolveWorld("/about?ref=nav");
    const inner = resolveWorld("/about?ref=nav&world=inner");

    expect(outer.world).toBe("outer");
    expect(outer.runtime).toBe("rinspace-web");
    expect(outer.canonicalHref).toBe("/about?ref=nav");
    expect(inner.world).toBe("inner");
    expect(inner.runtime).toBe("mastodon");
    expect(inner.canonicalHref).toBe("/about?ref=nav&world=inner");
  });

  it("strips invalid world values and falls back to the route default", () => {
    const resolution = resolveWorld("/about?world=outer&ref=nav");

    expect(resolution.world).toBe("outer");
    expect(resolution.invalidWorld).toBe(true);
    expect(resolution.canonicalHref).toBe("/about?ref=nav");
  });

  it("keeps outer pages and permanent post links path-owned", () => {
    const outer = resolveWorld("/a/42/a-proof?world=inner&ref=share");
    const inner = resolveWorld("/p/123/hello?world=inner&ref=share");

    expect(outer.world).toBe("outer");
    expect(outer.canonicalHref).toBe("/a/42/a-proof?ref=share");
    expect(inner.world).toBe("inner");
    expect(inner.runtime).toBe("mastodon");
    expect(inner.canonicalHref).toBe("/p/123/hello?ref=share");
  });

  it("canonicalizes non-post inner pages with an explicit world selector", () => {
    const explore = resolveWorld("/explore?tab=posts");
    const settings = resolveWorld("/settings/preferences/appearance");

    expect(explore.world).toBe("inner");
    expect(explore.canonicalHref).toBe("/explore?tab=posts&world=inner");
    expect(settings.runtime).toBe("mastodon");
    expect(settings.canonicalHref).toBe(
      "/settings/preferences/appearance?world=inner",
    );
  });

  it("flips dual account pages in place and single pages to the other home", () => {
    const account = resolveWorld("/@alice?tab=books");
    const article = resolveWorld("/a/42/a-proof");

    expect(flipTarget("/@alice?tab=books", account)).toBe(
      "/@alice?tab=books&world=inner",
    );
    expect(flipTarget("/a/42/a-proof", article)).toBe("/?world=inner");
    expect(currentWorldHome("outer")).toBe("/");
    expect(currentWorldHome("inner")).toBe("/?world=inner");
  });

  it("uses an explicit binding to flip tag pages without guessing", () => {
    const outerTag = resolveWorld("/tags/42/graph-theory");
    const innerTag = resolveWorld("/tags/graph_theory?world=inner");

    expect(flipTarget("/tags/42/graph-theory", outerTag)).toBe("/?world=inner");
    expect(
      flipTarget("/tags/42/graph-theory", outerTag, {
        oppositePath: "/tags/graph_theory",
      }),
    ).toBe("/tags/graph_theory?world=inner");
    expect(
      flipTarget("/tags/graph_theory?world=inner", innerTag, {
        oppositePath: "/tags/42/graph-theory",
      }),
    ).toBe("/tags/42/graph-theory");
  });

  it("carries the current world only into dual destinations", () => {
    expect(hrefInWorld("/search?q=graph", "inner")).toBe(
      "/search?q=graph&world=inner",
    );
    expect(hrefInWorld("/settings", "inner")).toBe("/settings?world=inner");
    expect(hrefInWorld("/a/42/a-proof?world=inner", "inner")).toBe(
      "/a/42/a-proof",
    );
  });

  it("keeps protocol URLs out of world logic and blocks legacy status URLs", () => {
    const service = resolveWorld("/api/v1/timelines/home?world=inner");
    const federation = resolveWorld("/users/alice/followers");
    const legacy = resolveWorld("/@alice/123");
    const accountMedia = resolveWorld("/@alice/media");

    expect(service.world).toBeNull();
    expect(service.canonicalHref).toBe("/api/v1/timelines/home?world=inner");
    expect(federation.route?.kind).toBe("federation-disabled");
    expect(federation.runtime).toBe("blocked");
    expect(legacy.route?.id).toBe("legacy.mastodon-status");
    expect(flipTarget("/@alice/123", legacy)).toBeNull();
    expect(accountMedia.route?.id).toBe("inner.account-media");
    expect(accountMedia.world).toBe("inner");
    expect(accountMedia.canonicalHref).toBe("/@alice/media?world=inner");
  });
});
