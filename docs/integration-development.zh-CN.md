# 本地跨仓库联调

Rinspace Web 始终作为一个完整应用消费，不按几十个页面入口分别接入。全部路由共享一个 Vite server、一份严格 runtime config、一个 API 契约和一套 adapter 装配。

先在 loopback 启动兼容私有后端，再从 `rinspace-web` checkout 执行：

```bash
pnpm install --frozen-lockfile
pnpm dev:integration -- --backend http://127.0.0.1:8080
```

打开 `http://127.0.0.1:5173/rinspace/`。`runtime.integration.json` 只暴露同源 `/rinspace/api/` 与 `/rinspace/auth/v1/`。`RINSPACE_DEV_PROXY_TARGET` 只由服务器侧 Vite 读取，绝不会复制进浏览器 config。远程、带凭据、带路径或非 loopback target 都会被拒绝。

可用参数：

```bash
pnpm dev:integration -- --backend http://localhost:9090 --port 5190
pnpm dev:integration -- --dry-run
```

host 始终限制为 loopback，端口必须在 1024–65535。Gitea、Renderer、上传和 workspace 在兼容本地依赖与 runtime capability 明确配置前保持关闭。

私有 Rinspace 仓库提供 `npm run dev:web`。设置 `RINSPACE_WEB_WORKTREE` 时使用未提交的前端工作树；未设置时，私有入口把 `rinspace-web.lock.json` 的精确 commit 检出到被忽略的 `.rinspace-web-cache/`，生产级 lock 由 Task 32 安装。入口在启动本命令前记录前后端完整 commit、dirty flag、契约版本和 runtime channel，绝不把前端源码复制进私有仓库。
