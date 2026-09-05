import { beforeEach, describe, expect, it } from "vitest";

import {
  prepareWorldFlipNavigation,
  worldTransitionDirection,
} from "../packages/world-shell/src";

describe("world transition lifecycle", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.sessionStorage.clear();
    delete document.documentElement.dataset.rinWorldTransition;
  });

  it("derives direction only when a navigation changes worlds", () => {
    expect(worldTransitionDirection("/", "/?world=inner")).toBe(
      "outer-to-inner",
    );
    expect(worldTransitionDirection("/?world=inner", "/")).toBe(
      "inner-to-outer",
    );
    expect(worldTransitionDirection("/about", "/search")).toBeNull();
    expect(
      worldTransitionDirection("/tags?world=inner", "/search?world=inner"),
    ).toBeNull();
  });

  it("records an explicit flip before allowing native navigation", () => {
    expect(prepareWorldFlipNavigation("/?world=inner")).toBe(
      "outer-to-inner",
    );
    expect(document.documentElement.dataset.rinWorldTransition).toBe(
      "outer-to-inner",
    );
    expect(window.sessionStorage.getItem("rinspace:world-transition:v1")).toContain(
      '"targetHref":"http://localhost:3000/?world=inner"',
    );
  });
});
