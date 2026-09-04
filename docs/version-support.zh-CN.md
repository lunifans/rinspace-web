# 版本支持与安全修复

Rinspace Web 支持最新两个 minor release line，且 successor 发布后每条旧线至少保留 90 天。每条受支持 minor 只维护最新 patch。Release notes 会列出契约兼容、迁移要求、支持的后端版本和回滚限制。

普通修复必须先进入本公开仓库，形成不可变且验证过的 release，再由官方私有部署 lock 选择。官方部署绝不消费 `main`、`latest` 或生产主机现场构建。

法律/社区发布门禁完成后，安全报告使用正式 `SECURITY.md` 中的私密渠道。Embargo 修复只在受限 security-advisory fork 进行；最迟在部署时公开已修复的对应源码、release checksum、SBOM 和 attestation。未修复漏洞不得提交到公开 issue。

临时 official-only 浏览器 patch 最长 168 小时，必须已经建立公开回合 PR；完成公开合并前，它会阻断下一次普通 release。Owner、原因、base lock、patch digest、到期时间和最终公开 commit 均由私有运营 registry 审计。该例外不得携带凭据、弱化授权或绕过 release/法律门禁。

破坏性 API 版本至少并行 90 天并跨越两个公开 minor release。窗口结束后，不支持的旧客户端收到 HTTP 426、`contract.upgrade_required`、最低版本和可操作的公开 release/source 链接。
