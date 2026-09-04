# Production-only capabilities

Rinspace Web ships one frontend codebase and one versioned application artifact. Browser routes are not separate integration entry points. Deployment selects `demo`, `integration`, or `official` adapters from a validated `runtime-config.json`; pages call the shared auth, HTTP, upload, renderer, and workspace ports.

The zero-credential demo fails closed for production services. Its control panel and affected pages expose the same capability state, dependency, and recovery path described below.

| Capability | Demo state | Production dependency | Recovery path |
| --- | --- | --- | --- |
| Gitea | Unavailable | Same-origin Gitea service and identity bridge | Use `integration` or `official` mode with a compatible Gitea adapter. |
| code-server | Unavailable | Authenticated remote workspace service | Use `integration` or `official` mode with a compatible workspace adapter. |
| Renderer | Unavailable | Asynchronous renderer and job API | Use `integration` or `official` mode with a compatible renderer adapter. |
| Quiver | Unavailable | Same-origin Quiver application and diagram API | Explicitly enable Quiver in an `integration` or `official` deployment. |
| Payments | Unavailable | Order service, provider credentials, and verified callbacks | Enable only in an `official` deployment with its server-side payment backend. |
| SMS | Unavailable | Supported auth provider and configured server-side sender | Configure `integration` or `official` authentication and its SMS sender. |
| Real uploads | Local-only | Object storage and upload authorization service | Keep the local image simulation (images up to 2 MB), or configure an upload adapter. PDF and archive uploads remain unavailable in the demo. |

The demo never redirects to Gitea or a payment provider, opens a remote workspace, loads a Quiver iframe, submits a render job, polls a production job, sends an SMS, or uploads to production storage. Local Markdown/LaTeX creation, local previews, and local image storage remain available.

## Official consumption

Official deployment pins a release tag, full commit, artifact SHA-256, and API contract version in `rinspace-web.lock.json`. The private deployment workflow verifies the artifact and its provenance, assembles the small official HTML/runtime-config shell, runs staging contract and browser checks, and atomically deploys the verified static directory. It never copies a mutable frontend worktree or consumes an unpinned `main` artifact.

Local integration development uses the public repository's `pnpm dev:integration` command and a development-server proxy so that the browser continues to use registered same-origin API paths. Production endpoints and internal proxy targets do not belong in browser runtime configuration.

> The packaging, release-lock, and official switch workflows are implemented by Tasks 23 and 30–33. Until those tasks pass, this section is the required interface contract, not a claim that the final consumption pipeline is already live.

## 生产专用能力

Rinspace Web 只发布一份前端源码和一份版本化应用产物。页面路由不是彼此独立的集成入口；部署通过经过校验的 `runtime-config.json` 选择 `demo`、`integration` 或 `official` adapter，页面只调用统一的认证、HTTP、上传、渲染和工作区 port。

零凭据 demo 对生产服务失败关闭：不会跳转 Gitea 或支付平台，不会打开远程工作区、加载 Quiver iframe、提交/轮询生产渲染任务、发送短信或上传到生产存储。本地 Markdown/LaTeX 创作、本地预览和不超过 2MB 的本地图片仍然可用。每项能力的依赖和恢复路径可在演示控制面及相关页面查看。

官方部署最终只通过 `rinspace-web.lock.json` 固定并验证 release tag、完整 commit、artifact SHA-256 和 API contract version，再组装 official 外壳、通过 staging 契约/浏览器检查并原子部署；不会复制可修改工作树，也不会消费未固定的 `main` 产物。该流水线由 Task 23、30–33 落地，在这些任务通过前，本节是接口约束而不是“已上线”的声明。
