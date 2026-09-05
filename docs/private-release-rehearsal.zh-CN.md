# 私有发布候选演练

仅当 `rinspacehq/rinspace-web` 仍为 private 且不可变 candidate release 已存在时，才能运行 `Private Release Rehearsal` workflow。该流程只能手动触发，使用受保护的 `private-release-rehearsal` environment 和专用 release-build runner；它不会授权修改仓库可见性。

输入必须包含 candidate 的精确 tag/full commit、不同的上一 release tag，以及 Release、Public CI、Container CI、Static Host Preview 四条成功 workflow 的 run ID。所有 run 必须属于同一个 candidate commit。branch、`latest`、失败 run、已经公开的仓库或未通过法律 release gate 都会被拒绝。

仓库内流程会从干净副本复现 README 快速开始；执行源码、依赖、API、route、i18n、类型、lint、coverage、package、静态托管、容器契约和 release shell 门禁；只构建一次中立 core 并组装 root/subpath 包；在 Chromium、Firefox、WebKit 验证 guest/member 和网络 fail-closed；运行打包产物的 desktop/mobile、light/dark、reduced-motion 项目；重新生成合成截图；核对 release 校验和与 attestation。

## 受保护审计 harness

release-build runner 必须提供 `/etc/rinspace/bin/verify-rinspace-web-private-release`。该运维方持有的 harness 只接收有界的源码、package、release、Actions log 和截图目录，以及不可变 candidate/previous 身份。它必须：

- 扫描完整 Git 历史和当前源码中的秘密、生产数据、内部材料、危险文件及未批准第三方内容；
- 扫描 release 附件、SPDX SBOM、容器配置/层、workflow 日志和截图 metadata，且不得把命中的秘密复制到 evidence；
- 通过 root/subpath Compose 启动 release 非 root 镜像，验证只读/无 capability、health、深层刷新、缓存、重启和两个发布架构；
- 在真实静态托管平台部署 root/subpath preview，核对 fallback/cache/worker/config 后删除或回滚；
- 恢复精确上一 release 与兼容 demo 数据并验证，再部署 candidate，保留无秘密回滚证据；
- 生成符合 `schemas/private-release-rehearsal.schema.json` 的 `private-release-rehearsal.json`，每个通过项都带具体、无秘密的 evidence 引用。

仓库内 validator 会拒绝缺项或只有布尔值的自我声明。evidence 作为受保护 workflow artifact 保留 90 天；harness 失败或不存在时演练保持未完成。

该流程只覆盖技术 readiness。法律/权利人批准、最终仓库设置、官方主站 dogfood 和单独授权的公开可见性变更仍是独立门禁。
