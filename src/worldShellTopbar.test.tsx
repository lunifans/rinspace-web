import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RinspaceTopbar } from "../packages/world-shell/src";

describe("RinspaceTopbar", () => {
  it("renders the Logo and current-world home as separate accessible links", () => {
    render(
      <RinspaceTopbar
        brandName="Rinspace"
        world="outer"
        currentHomeHref="/"
        flipHref="/?world=inner"
        labels={{
          flip: "翻到里世界",
          home: "返回当前世界首页",
          navigation: "Rinspace 全局导航",
        }}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Rinspace 全局导航" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "翻到里世界" }).getAttribute("href"),
    ).toBe("/?world=inner");
    expect(
      screen
        .getByRole("link", { name: "返回当前世界首页" })
        .getAttribute("href"),
    ).toBe("/");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("allows a runtime adapter to intercept plain navigation", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn(() => true);
    render(
      <RinspaceTopbar
        brandName="Rinspace"
        world="inner"
        currentHomeHref="/?world=inner"
        flipHref="/"
        labels={{
          flip: "翻到表世界",
          home: "返回当前世界首页",
          navigation: "Rinspace 全局导航",
        }}
        ports={{ navigation: { navigate } }}
      />,
    );

    await user.click(screen.getByRole("link", { name: "翻到表世界" }));

    expect(navigate).toHaveBeenCalledWith({
      href: "/",
      reason: "flip",
      world: "inner",
    });
  });
});
