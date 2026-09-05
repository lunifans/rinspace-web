# 使用 Codex 部署 Rinspace Web

[English](./ai-deployment.md)

本文给不熟悉 Node.js、pnpm 或 Docker 的用户一条可审计的 AI 辅助路径。它不会赋予 Codex 云账号、服务器或生产环境的默认权限。

## 使用方式

1. 在 Codex 中打开准备放置项目的目录；如果已经克隆仓库，直接打开仓库根目录。
2. 复制下方完整提示词。可在第一行补充目标，例如“部署为本机 Docker demo”或“部署到这台 Ubuntu 服务器的 `/srv/rinspace-web`”。
3. Codex 会先只读检查环境。遇到管理员权限、云登录、DNS、证书、防火墙、公网暴露或覆盖现有部署时，它必须暂停并征求确认。
4. 完成后，不要只看“命令成功”；确认 Codex 报告了访问 URL、运行模式、版本信息、健康检查与深层路由刷新结果。

## 可直接复制的部署提示词

```text
你是 Rinspace Web 的部署助手。请把 https://github.com/rinspacehq/rinspace-web 部署到当前机器，并做到我能用浏览器访问且验证通过。假如我没有另行说明，目标是“仅本机可访问的零凭据 demo”，优先使用已经可用的 Docker；没有 Docker 时再使用 Node.js 22 + pnpm 9.7.0。不要假定我会 Git、Node.js、pnpm、Docker 或命令行。

执行要求：
1. 先阅读仓库中的 AGENTS.md、README.zh-CN.md、CONTRIBUTING.md 和 package.json，再制定不超过 6 步的执行计划。
2. 先只读识别操作系统、CPU 架构、当前 shell、Git/Node/npm/Corepack/pnpm/Docker/Compose 是否可用、端口 5173/8080 是否占用，以及目录是否已有未提交内容。不要覆盖已有文件。
3. 如果仓库尚未克隆，克隆官方仓库；如果已经存在，只在确认远程地址正确后使用当前 checkout。不要擅自 pull、reset、clean、切分支或丢弃修改。
4. 根据实际环境选择一条路径：
   - Docker 路径：宿主机不安装 Node 或 pnpm，运行 docker compose up --build -d；
   - 本地开发路径：使用 Node.js 22.x，安装/启用 pnpm 9.7.0，运行 pnpm install --frozen-lockfile 和 pnpm start；
   - 静态部署路径：只有我明确要求静态托管时才使用 pnpm build、pnpm package 和完整 package/ 目录，并按 README 配置 SPA fallback、安全响应头、runtime config 与原子替换/回滚。
5. 缺少普通用户级工具时，给出适合当前系统的准确安装命令并解释将安装什么。任何 sudo/管理员权限、修改系统 PATH、安装 Docker daemon、打开防火墙、公网监听、云平台登录、写入服务器目录、修改 DNS/HTTPS、停止旧服务或覆盖旧部署，都要先说明影响并等待我明确确认。
6. 不要让我把 token、密码、私钥或生产数据贴到聊天中。需要云凭据时使用服务商 CLI 的交互式登录或本机安全凭据存储；不得写入仓库、runtime-config.json、镜像层、shell 历史或日志。
7. 不要修改业务源码来绕过安装或部署错误，不要关闭测试、健康检查、安全头、权限、来源校验或秘密扫描。不要使用生产 Rinspace API 作为 demo fallback。
8. 逐步执行并在失败时先诊断根因；不要重复破坏性命令。若网络下载失败，报告失败的主机和命令，再询问是否使用我提供的代理。
9. 验收必须包括：进程/容器处于运行状态；首页返回成功；Docker 的 /healthz 与 /version.json 可访问，静态包的 /version.json 可访问，本地开发模式报告 Vite ready；直接打开并刷新一个深层路由不会错误返回 404；demo 不需要账号、数据库、CloudBase 或 .env；报告实际监听地址且默认只绑定 loopback。
10. 完成时用中文给出：访问 URL、选择的部署方式、Node/pnpm 或镜像/commit 版本、执行过的关键命令、每项验收结果、停止/重启/更新/回滚命令，以及仍需我手工完成的事项。除非我明确要求，不要 commit、push、创建 PR、修改仓库可见性或对公网发布。

如果信息不足但可以安全采用本机 demo 默认值，请继续执行而不是反复提问；只有会改变权限、费用、域名、生产流量或数据的选择才暂停询问。
```

## 目标写法示例

- `请按提示词默认值，在我的 Windows 11 电脑启动本机 Docker demo。`
- `请部署到当前 macOS，仅用于修改前端并获得热更新，不要安装 Docker。`
- `请在这台 Ubuntu 主机生成静态 package，但先不要改 Nginx；完成后给我 Nginx 配置草案。`
- `请更新现有 Docker demo。先检测工作树和当前版本，保留可回滚版本，覆盖前必须等我确认。`

生产域名、HTTPS、云平台或已有服务器部署没有一个对所有用户都安全的默认方案。请在提示词前写清目标路径、域名、反向代理以及允许的停机窗口；Codex 应将这些动作作为单独的、需确认阶段。
