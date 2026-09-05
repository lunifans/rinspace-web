# `@rinspace/world-shell`

Framework-light shared navigation for the two Rinspace Web runtimes. It contains the public world-route resolver, separate Logo and brand-home controls, adapter port types, and namespaced topbar styles. It does not depend on React Router, Redux, CloudBase, Mastodon state, private endpoints, or production configuration.

Rinspace 的两个 Web runtime 共用的轻量导航包。它提供公开的世界路由解析器、相互独立的 Logo/品牌首页控件、adapter port 类型和带命名空间的顶栏样式，不依赖 React Router、Redux、CloudBase、Mastodon 状态、私有 endpoint 或生产配置。

```tsx
import {
  RinspaceTopbar,
  flipTarget,
  resolveWorld,
} from "@rinspace/world-shell";
import "@rinspace/world-shell/styles.css";

const resolution = resolveWorld(window.location.href);
const flipHref = flipTarget(window.location.href, resolution) ?? "/";

<RinspaceTopbar
  brandName="Rinspace"
  world={resolution.world ?? "outer"}
  currentHomeHref={resolution.world === "inner" ? "/?world=inner" : "/"}
  flipHref={flipHref}
  labels={{
    flip: resolution.world === "inner" ? "翻到表世界" : "翻到里世界",
    home: "返回当前世界首页",
    navigation: "Rinspace 全局导航",
  }}
/>;
```

The default contract is generated from `config/world-routes.json` and the public route manifest. Run `pnpm check:world-routes` to prove the generated JSON, TypeScript snapshot, and documentation are current.

默认契约由 `config/world-routes.json` 与公开路由 manifest 生成。运行 `pnpm check:world-routes` 可验证生成的 JSON、TypeScript 快照和文档完全同步。

## Cross-document world turn / 跨文档世界翻面

Both same-origin runtimes must load `styles.css`, opt in with
`@view-transition { navigation: auto; }`, call
`prepareWorldFlipNavigation(href)` immediately before native Logo navigation,
and install `installWorldTransitionLifecycle()` during document bootstrap.
The outer adapter uses `bootstrap-theme.js` to preserve the early
`pagereveal` event before the application bundle runs.

两个同源 runtime 都必须加载 `styles.css`，通过
`@view-transition { navigation: auto; }` 启用跨文档转场，在 Logo 原生导航前立即调用
`prepareWorldFlipNavigation(href)`，并在文档启动阶段安装
`installWorldTransitionLifecycle()`。outer adapter 使用
`bootstrap-theme.js` 在应用 bundle 执行前保留早期 `pagereveal` 事件。

- A Logo click and browser back/forward create a normal history entry and infer
  direction from the source and target URLs. Refresh and direct entry do not
  invent a transition.
- The same dual resource restores its scroll position. A single-sided fallback
  opens the opposite home at the top.
- After navigation the first `main` region receives focus without changing
  the restored scroll position.
- Unsupported browsers use a short fade. Reduced-motion mode disables both 3D
  rotation and fallback animation. A 650 ms wall-clock deadline always removes
  transition state even when a browser omits or stalls `pagereveal`.

- Logo 点击及浏览器前进/后退使用正常历史记录，并根据来源和目标 URL 推导方向；刷新和直接打开不会伪造转场。
- 同一双面资源恢复滚动位置；单面页面的回退目标从相反世界首页顶部打开。
- 导航完成后，首个 `main` 区域获得焦点，但不会改变已恢复的滚动位置。
- 不支持的浏览器使用短淡入；低动态模式同时关闭 3D 旋转与回退动画。即使浏览器漏发或挂起
  `pagereveal`，650 ms 的独立时限也一定会清除转场状态。
