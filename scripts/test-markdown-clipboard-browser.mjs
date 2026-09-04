#!/usr/bin/env node

import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = (
  process.env.RINSPACE_BROWSER_BASE_URL || "http://127.0.0.1:4173"
).replace(/\/$/, "");
const chromiumPath = process.env.CHROMIUM_BIN;
const browserErrors = [];
const markdown = `# VS Code 粘贴标题

这是从 VS Code 复制的 Markdown 正文。

- 第一项
- 第二项

行内代码保持为 \`const answer = 42\`。`;
const vscodeHTML = `<div style="color: #cccccc; background-color: #1f1f1f; font-family: Consolas, 'Courier New', monospace; white-space: pre;">
  <div><span># VS Code 粘贴标题</span></div>
  <div><br></div>
  <div><span>这是从 VS Code 复制的 Markdown 正文。</span></div>
  <div><br></div>
  <div><span>- 第一项</span></div>
  <div><span>- 第二项</span></div>
</div>`;

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));

  await page.goto(`${baseURL}/write/markdown`, {
    waitUntil: "domcontentloaded",
  });
  const editor = page.locator(".ProseMirror");
  await editor.waitFor({ state: "visible" });
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");

  await page.evaluate(
    ({ plainText, htmlText }) => {
      const target =
        document.activeElement?.closest?.(".ProseMirror") ||
        document.querySelector(".ProseMirror");
      if (!target) throw new Error("Markdown editor is missing.");
      const data = new DataTransfer();
      data.setData("text/plain", plainText);
      data.setData("text/html", htmlText);
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    },
    { plainText: markdown, htmlText: vscodeHTML },
  );
  await page.waitForTimeout(900);

  const pasted = await page.evaluate(() => ({
    title: document.querySelector("#markdown-title")?.value || "",
    headings: Array.from(document.querySelectorAll(".ProseMirror h1")).map(
      (node) => node.textContent || "",
    ),
    paragraphs: Array.from(document.querySelectorAll(".ProseMirror p")).map(
      (node) => node.textContent || "",
    ),
    listItems: Array.from(document.querySelectorAll(".ProseMirror li")).map(
      (node) => (node.textContent || "").trim(),
    ),
    codeBlockCount: document.querySelectorAll(
      ".milkdown-code-block:not(.rin-latex-block)",
    ).length,
    inlineCode: Array.from(document.querySelectorAll(".ProseMirror code")).map(
      (node) => node.textContent || "",
    ),
  }));

  assert.equal(pasted.title, "VS Code 粘贴标题");
  assert.deepEqual(pasted.headings, ["VS Code 粘贴标题"]);
  assert.ok(
    pasted.paragraphs.includes("这是从 VS Code 复制的 Markdown 正文。"),
  );
  assert.deepEqual(pasted.listItems, ["第一项", "第二项"]);
  assert.equal(
    pasted.codeBlockCount,
    0,
    "VS Code clipboard HTML created an unwanted code block",
  );
  assert.ok(pasted.inlineCode.includes("const answer = 42"));

  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(250);
  assert.equal(
    (await editor.innerText()).trim(),
    "",
    "pasted Markdown could not be removed from the editor",
  );
  assert.deepEqual(browserErrors, []);
} finally {
  await browser.close();
}

console.log("VS Code Markdown clipboard browser acceptance passed");
