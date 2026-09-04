# Rinspace Web

[English](./README.md)

<!-- rinspace-section: product -->

## 产品定位

Rinspace Web 是 Rinspace（芥子环）的浏览器前端与本地演示运行时。它覆盖以 Tag 为中心的长文知识社区界面，包括 Markdown、LaTeX、书籍、讨论、个人资料、通知和创作者工作流。

本仓库不是可完整自托管的 Rinspace 服务：它不包含私有生产 API、数据库、Control Plane、Renderer、Gitea、code-server、支付回调、短信发送或对象存储服务。内置 demo 只使用确定性的合成数据和浏览器本地存储。

<!-- rinspace-section: scope -->

## 范围与运行模式

同一份源码和同一份带哈希 core 产物支持三种经过校验的运行模式：

| 模式          | 用途                      | 网络边界                                               |
| ------------- | ------------------------- | ------------------------------------------------------ |
| `demo`        | 安全产品体验与前端贡献    | 同源 MSW + 浏览器本地仓储；外部请求失败关闭            |
| `integration` | 连接独立运营的兼容后端    | 显式的兼容认证/API/integration endpoint                |
| `official`    | Rinspace 运营同一公开前端 | CloudBase 浏览器公开认证配置与 Rinspace 服务端 adapter |

85 条路由不是 85 个接入入口；它们统一消费 auth、HTTP、upload、renderer 和 workspace port。production-only 能力见[生产能力边界](./docs/production-capabilities.md)。

<!-- rinspace-section: demo -->

## Demo 身份与数据

- `guest` 展示匿名产品、公开内容、登录门禁和空状态。
- `member` 是合成本地身份，可关注、投票、评论、修改设置、读取通知、创作 Markdown/LaTeX 并在本地发布。
- 两者都没有管理员角色、真实 JWT 或生产凭据。
- Vitest、MSW、Playwright 与截图共用同一版本化 seed；reset 会精确恢复该 seed。

通过页面下沿的 demo 控制入口切换 persona，或选择可复现的错误/延迟 scenario。

<!-- rinspace-section: screenshots -->

## 截图

以下图片由 `pnpm capture:demo-screenshots` 从固定本地 seed 生成，不含生产响应或真实账号。

| Guest · 桌面                                                           | Member · 桌面                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ![桌面端 Guest demo](./docs/assets/screenshots/demo-guest-desktop.png) | ![桌面端 Member demo](./docs/assets/screenshots/demo-member-desktop.png) |

| Guest · 移动端                                                        | Member · 移动端                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![移动端 Guest demo](./docs/assets/screenshots/demo-guest-mobile.png) | ![移动端 Member demo](./docs/assets/screenshots/demo-member-mobile.png) |

<!-- rinspace-section: quick-start -->

## 三分钟快速开始

前置条件：Node.js 22 与 Corepack；仓库固定 pnpm 9.7.0。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

打开 <http://127.0.0.1:5173/>。不需要数据库、账号、CloudBase 项目或 `.env`。干净 checkout 文档门禁会测量从安装到 ready 的实际耗时，并验证 demo 不发出外部请求；Task 27 记录实际证据，不把未验证平台写成性能承诺。

<!-- rinspace-section: reset -->

## 重置本地 Demo

打开 demo 控制面，选择 **重置演示数据** 并确认。它只重置 Rinspace namespaced demo repository 与 scenario，保留 persona、语言、主题及无关浏览器存储。

如果 bootstrap 无法完成，可使用独立错误页的 **重置演示**。手工处理时只清理本地 origin 的站点数据；不要让 demo 复用 official 生产 origin。

<!-- rinspace-section: static-deployment -->

## 静态部署

core 只构建一次，然后在不重新编译的情况下组装根路径外壳：

```bash
pnpm build
pnpm package -- --config config/runtime.demo.json --out package
RINSPACE_ARTIFACT_DIR=package pnpm preview
```

子路径必须选用 `basePath`、本地 API、canonical、manifest scope 和 worker scope 一致的配置：

```bash
pnpm package -- --config config/runtime.demo.subpath.json --out package-subpath --base-path /rinspace-demo/
RINSPACE_ARTIFACT_DIR=package-subpath RINSPACE_PREVIEW_BASE_PATH=/rinspace-demo/ pnpm preview
```

部署完整输出目录。`_headers`、`_redirects`、`404.html` 和 `static-headers.json` 描述 SPA fallback、CSP、worker scope、哈希资源 immutable 与外壳 no-store 规则。托管平台不得把缺失 JS/CSS/font 重写为 HTML。

首个特定平台模板选择 Netlify。`pnpm prepare:netlify` 使用同一 package 实现生成正确的 root/subpath 物理布局；配置更新、验证和回滚见 [`docs/static-hosting-netlify.zh-CN.md`](./docs/static-hosting-netlify.zh-CN.md)。在带凭据 preview 与回滚留下实测记录前，不提供一键部署按钮。

<!-- rinspace-section: docker-deployment -->

## Docker 与 Compose

默认 Compose 在 loopback 8080 构建并运行零凭据根路径 demo：

```bash
docker compose up --build
```

经过验证的子路径 overlay：

```bash
docker compose -f compose.yaml -f compose.subpath.yaml up --build
```

runtime 使用 UID/GID 1000、监听 8080、drop 全部 Linux capabilities、只读根文件系统，只把生成的外壳/config 写入 `/run/rinspace` tmpfs。`/healthz` 与 `/version.json` 提供健康状态和不可变构建事实。Compose 不使用 privileged、host network、Docker socket、凭据或持久卷。

<!-- rinspace-section: integration -->

## 兼容后端联调

实现 `contracts/openapi.yaml` 的版本化契约，在 loopback 启动兼容私有后端，再使用专用 Vite 联调入口：

```bash
pnpm dev:integration -- --backend http://127.0.0.1:8080
```

打开 `http://127.0.0.1:5173/rinspace/`。浏览器只看到同源 `/rinspace/api/` 与 `/rinspace/auth/v1/`；loopback 后端 target 只存在于 Vite 进程，不会进入 runtime config 或生产 bundle。官方私有仓库的 worktree/lock 入口与四类脏工作树场景见 [`docs/integration-development.zh-CN.md`](./docs/integration-development.zh-CN.md)；additive-first 与破坏性 API 规则见 [`docs/api-compatibility.zh-CN.md`](./docs/api-compatibility.zh-CN.md)。

静态托管使用经过校验的 integration config 执行 `pnpm package`。容器可通过 `RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON` 提供完整公开文档，secret 形态字段仍会被拒绝。认证、cookie/CORS、上传、Renderer、Gitea 与 workspace 服务由集成方安全实现。

<!-- rinspace-section: architecture -->

## 架构

```text
不可变 core（带哈希 JS/CSS/assets + version.json）
                     │
部署外壳（index + runtime-config + CSP/cache/fallback）
                     │
bootstrap → mode adapters → 统一 auth/HTTP/upload/renderer/workspace ports
                     │
              85 条路由与功能模块
```

Bootstrap 以 `no-store` 加载同源 `runtime-config.json`，通过 Zod 校验，安装网络策略和 mode adapter，最后才挂载 React。Demo 必须在业务请求前启动 scoped MSW worker。

<!-- rinspace-section: configuration -->

## 浏览器公开配置

`RuntimeConfig` 是严格且有版本的。主要容器覆盖项包括：

- `RINSPACE_PUBLIC_BASE_PATH`
- `RINSPACE_PUBLIC_API_BASE_URL`
- `RINSPACE_PUBLIC_CANONICAL_ORIGIN`
- `RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON`

CloudBase env ID、region 与 publishable key 可以是浏览器公开值，但只能位于 `cloudbase` auth provider 配置。不得把数据库 URL/密码、私钥、管理员身份、支付凭据、service token 或内部 proxy target 写进 runtime config。

<!-- rinspace-section: testing -->

## 测试

贡献者核心检查：

```bash
pnpm check
pnpm lint
pnpm test
pnpm test:static-package
pnpm test:container-contract
pnpm check:i18n
pnpm check:api-contract
pnpm check:route-contracts
pnpm test:demo-routes:browser
```

公开 CI 还会检查发布边界、依赖许可证、锁文件差异、coverage、release budget、Actions 固定版本和 fail-closed 法律发布策略。正式 Vite/Docker build、多架构 smoke、截图、release artifact 与 provenance 只在指定 self-hosted workflow 执行；fork PR 绝不在这些 runner 上执行代码，维护者审查后需从仓库内分支验证该 commit。详情见 [`docs/supply-chain.zh-CN.md`](./docs/supply-chain.zh-CN.md) 与 `package.json`。

正式公开前必须在仓库仍为 private 时对精确 release 演练，包括干净 quick start、三浏览器覆盖、真实静态托管 preview、容器层/workflow 日志/截图审计和上一 release 回滚。详见 [`docs/private-release-rehearsal.zh-CN.md`](./docs/private-release-rehearsal.zh-CN.md)。

<!-- rinspace-section: licensing -->

## 许可与贡献状态

Rinspace 自有软件面向社区采用 `AGPL-3.0-only`，同时提供独立 commercial licensing，满足需要专有修改或集成的客户。第三方材料继续适用各自条款：其中 `src/components/animate-ui/` 保留 Animate UI 署名并适用随仓库提供的 MIT + Commons Clause 条款，不纳入 Rinspace 商业再许可。范围详见 [`LICENSING.md`](./LICENSING.md)。

权利主体已经在明确披露“非律师审查”的前提下，依据中国法和成熟项目文本定稿 `LICENSE`、许可说明、CLA 模板、商标政策与资产条款。自动 CLA 接受/备份流程和仓库治理仍是任务 26 门禁，因此现在不得合并外部贡献。该候选在其余发布门禁通过前仍保持 private；第三方材料不会因包含在应用中而被重新许可。参见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

<!-- rinspace-section: security -->

## 安全

不要在 issue、截图、runtime config、demo fixture 或诊断导出中放入凭据、真实用户或生产数据。Demo 网络失败关闭，诊断只导出版本、mode、route 和安全错误码。

疑似漏洞应优先通过启用后的 GitHub 私密漏洞报告，或按 [`SECURITY.md`](./SECURITY.md) 使用私密邮箱渠道；绝不能在公开 issue 披露细节。该政策有意不承诺响应时限、赏金或超出适用法律和明确书面协议的保密义务。受支持 release line、紧急 patch 上限与破坏性契约窗口见 [`docs/version-support.zh-CN.md`](./docs/version-support.zh-CN.md)。

<!-- rinspace-section: limitations -->

## 已知限制

- Demo 是单浏览器本地产品模拟，不是多人服务器。
- 支付、短信、真实上传、Gitea、code-server、Quiver 和 durable Renderer job 是 production-only。
- 静态托管只提供客户端 metadata 与 SPA fallback，不提供按请求动态 SSR。
- Integration mode 依赖契约兼容且由集成方独立保护的后端。
- 第三方、法律、release 与明确公开授权门禁全部通过前，仓库仍是 private candidate。
