import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test } from "vitest";

import { ensureLocaleNamespaces, i18n } from "@/i18n";

import {
  BlogTableOfContents,
  BookReaderTableOfContents,
} from "./index";

const tocItems = [
  { id: "section", text: "Section", level: 2 as const },
  { id: "subsection", text: "Subsection", level: 3 as const },
];

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
});

test("switches a blog table of contents without resetting its collapsed state", async () => {
  await ensureLocaleNamespaces("en", ["reader"]);
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = render(
    <MemoryRouter>
      <BlogTableOfContents
        items={tocItems}
        activeId=""
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  fireEvent.click(view.getByRole("button", { name: "Collapse Section" }));
  expect(view.queryByText("Subsection")).toBeNull();

  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  expect(view.getByRole("navigation", { name: "博客目录" })).toBeTruthy();
  expect(view.getByRole("button", { name: "展开 Section" })).toBeTruthy();
  expect(view.queryByText("Subsection")).toBeNull();
});

test("localizes book reader navigation and page counts", async () => {
  await ensureLocaleNamespaces("en", ["reader"]);
  await ensureLocaleNamespaces("zh-CN", ["reader"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = render(
    <MemoryRouter>
      <BookReaderTableOfContents
        items={tocItems}
        activeId="section"
        pageId="section"
        onSelect={() => undefined}
      />
    </MemoryRouter>,
  );

  expect(
    view.getByRole("navigation", { name: "Book table of contents" }),
  ).toBeTruthy();
  expect(view.getByText("1 page")).toBeTruthy();

  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  expect(view.getByRole("navigation", { name: "书籍目录" })).toBeTruthy();
  expect(view.getByText("1 页")).toBeTruthy();
});
