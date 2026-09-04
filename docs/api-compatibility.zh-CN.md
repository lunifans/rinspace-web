# API 兼容与版本演进

Rinspace Web 通过 `contracts/openapi.yaml` 的 `x-rinspace-contract-version` 声明所需契约。每份 runtime config 都在 `api.contractVersion` 重复该版本；两者不一致属于 release 错误，浏览器不得静默回退。

## Additive-first 变更

兼容 API 按以下顺序演进：

1. 先部署后端增量能力，同时保留当前受支持前端使用的字段、状态码、方法和路由。
2. 更新公开 OpenAPI、生成类型、demo handlers 和前端行为；用精确公开 commit 对精确后端 commit 做验证。
3. 发布不可变前端 release，记录 commit、tag、checksum、SBOM、attestation 和契约版本。
4. 把官方私有 lock 升级到该 release，并在后端仍支持上一前端时观察。
5. 只有公开迁移窗口与支持政策均允许后，才删除旧行为。

新响应字段对旧客户端必须可选；新请求字段在所有受支持客户端都发送前也必须可选。同一契约版本下不得改变既有 enum 值、成功状态、标识符、分页 cursor、认证要求或错误码的含义。

## 破坏性版本

确实需要的破坏性变更必须提升契约主版本（如 `v1` 到 `v2`），并让两个版本并行至少 90 天且跨越连续两个公开 minor release。Release notes 必须列出受影响 operation、首个兼容前端、旧版本最终支持日期、数据迁移要求和回滚限制。

迁移窗口结束后，被拒绝的旧前端收到 HTTP `426` 与结构化 `contract.upgrade_required`，其中包含最低支持契约版本和公开 release/source 链接。旧前端必须显示可操作的升级页面，不得无限重试或静默切换 endpoint。

双版本窗口内回滚时，恢复上一份 official frontend lock 与 runtime config，后端继续同时提供两个契约。如果后端回归已经破坏兼容承诺，必须先恢复最后一个双版本后端，再调整前端 lock。不得用 `main`、`latest` 或未验证制品绕过问题。

## 公开 PR 与私有验证

公开 PR 只运行合成 demo 和公开契约检查，不获得私有仓库凭据或 staging token。获授权维护者另行手动触发私有 `rinspace-web-cross-repo` workflow，并输入小写完整 40 位公开 commit。受保护 workflow 检出两个精确 commit，在 loopback 执行 OpenAPI 兼容和 Chromium 联调，并记录两个 commit、契约版本与 `runtime.integration.json`。

私有 workflow 不接受 `pull_request`、`pull_request_target`、`repository_dispatch`、分支名或移动 tag 触发。跨仓验证成功只是审查证据，不会自行发布 release 或更新 official lock。
