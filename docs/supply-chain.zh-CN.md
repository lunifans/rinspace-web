# 供应链与发布验证

PR workflow 只有仓库只读权限，执行类型、lint、生成契约、依赖/许可证、Vitest coverage、公开边界扫描和锁文件审查。正式静态包、浏览器和容器任务只允许同仓库分支使用指定 self-hosted runner；fork 代码绝不在这些 runner 上执行。

所有 `uses:` 都固定到完整 commit SHA，并镜像记录在 `config/github-actions-policy.json`。Dependabot 会提出 pnpm、Actions 和 Docker 更新，但审查者必须阅读上游差异并同步更新策略记录。`pnpm install --frozen-lockfile` 阻止未审查的依赖图改写。

如果指定的 self-hosted runner 只能通过本机代理访问镜像仓库，请把经过审查、按换行分隔的 Buildx driver options 写入仓库变量 `RINSPACE_BUILDX_DRIVER_OPTS`。例如代理监听宿主机 loopback 时，可使用 `network=host`，并设置 `env.http_proxy=...`、`env.https_proxy=...` 与 `env.no_proxy=...`。能够直连 registry 时保持变量未设置。该值是配置而不是秘密，绝不能放入账号密码或 bearer token。

Release workflow 只接受已存在的 `vX.Y.Z` tag；tag 必须解析到当前检出的完整 commit，并与 `package.json` 版本一致。它生成：

- 确定性的根路径 demo tar；
- `SHA256SUMS`、`version.json` 与 changelog；
- SPDX 2.3 生产依赖 SBOM；
- 自包含的 Node 22 official-shell 组装器，在不重建应用资源的前提下校验完整浏览器公开 runtime config；
- 以 digest 寻址、同时支持 `linux/amd64` 和 `linux/arm64` 的 GHCR 镜像；
- 静态包、SBOM 和 official-shell 组装器的 GitHub build provenance attestation，以及镜像 OCI provenance/SBOM；
- 绑定仓库、tag、完整 commit、制品摘要、API 契约版本、镜像名称、平台和 digest 的 release metadata。

创建 release 前，CI 会对三项可下载对象运行 `gh attestation verify`、核对全部 SHA-256、再次解析 source tag，并检查不可变镜像 digest。消费者必须使用 digest 和 release metadata，不能消费 `main` 或浮动容器 tag。

在法律文件、demo 数据许可和全部依赖许可获批前，`config/release-policy.json` 会故意阻断 release。通过 release 门禁也不授权改变仓库可见性；公开仓库仍是独立、明确的人工动作。
