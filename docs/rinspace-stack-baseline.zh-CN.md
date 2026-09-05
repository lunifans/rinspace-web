# Rinspace 技术栈开发基线

[English](./rinspace-stack-baseline.md)

机器可读基线位于 [`contracts/rinspace-stack-baseline.json`](../contracts/rinspace-stack-baseline.json)。它记录表里世界实施前实际核查的准确源码提交，不是生产部署记录，也不包含 endpoint、凭据、个人信息或数据库内容。

## 已记录组件

| 组件                     | 提交                                       | 基线时职责                              |
| ------------------------ | ------------------------------------------ | --------------------------------------- |
| `rinspacehq/rinspace-web`  | `d8878c0ddc10275f0ae0cac2ef726c418fcb5b20` | 公开表世界前端、确定性 Demo 和公共契约  |
| `rinspacehq/mastodon`      | `0a32b4a831838ef1f363a915c2e71e2a1b52cf0d` | 公开里世界 fork 基线                    |
| 私有 `rinspacehq/rinspace` | `d5e83cb83577e0935ebd20665782884de75643cd` | 网关、身份/控制面、私有适配器和部署编排 |

核查时 Mastodon fork 与上游 `main` 指向同一提交，因此初始 Rinspace 补丁清单为空。未来每个 fork 补丁必须归为“可上游化”“Rinspace 产品行为”或“长期安全行为”，并记录上游基线、变更文件、验证、许可证影响和升级说明。

## 兼容规则

开发阶段可以使用显式 worktree，但正式 release 必须把每个组件绑定到完整 40 位提交和不可变制品摘要。浮动分支、`latest` 标签、未记录的 dirty 构建和猜测兼容关系均不是有效发布输入。初始兼容族为世界路由契约 `1.x`、`@rinspace/world-shell` `0.1.x` 和 React peer `^19.0.0`。

私有集成流水线实现后，应使用正式 release lock 取代本开发基线。更新基线必须重新运行公共契约检查并评审 Mastodon 上游漂移；仅修改哈希会使基线门禁失去意义。
