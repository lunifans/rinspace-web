# 为 Rinspace Web 贡献代码

[English](./CONTRIBUTING.md)

感谢你帮助改进 Rinspace Web。本仓库只包含公开的 Web 前端和确定性本地 demo，不包含 Rinspace 私有后端或生产凭据。

## 开始之前

- 先搜索已有 issue 和 pull request，避免重复提交。
- 行为、API、依赖、许可或架构的大改动，应先通过 issue 与维护者确认范围。
- 不得提交生产数据、个人信息、访问 token、私有 endpoint、内部事故材料或自己无权贡献的第三方作品。
- 漏洞请按 [`SECURITY.md`](./SECURITY.md) 私下报告，不要创建公开 issue 或 PR。

## 只需一条命令的贡献签署

普通贡献不需要外部 CLA 服务、额外账号、身份证明或私密贡献者台账。每位 commit 作者通过匹配的 sign-off 确认仓库内的 [`DCO`](./DCO) 1.1，并接受 [`CONTRIBUTION-LICENSE.md`](./CONTRIBUTION-LICENSE.md)：

```bash
git commit -s
```

commit message 会包含：

```text
Signed-off-by: Your Name <you@example.com>
```

姓名和邮箱必须与 commit 作者一致，可以使用 GitHub `noreply` 邮箱。每位 `Co-authored-by` 共同作者都要有自己的匹配 `Signed-off-by`。最新 commit 漏签时运行 `git commit --amend --signoff`；多个 commit 漏签时使用交互式 rebase，或请维护者协助。

你保留著作权，并按 Apache License 2.0 许可贡献，使 Rinspace 能将其纳入 `AGPL-3.0-only` 社区版和另行许可的商业版。DCO workflow 仅通过 GitHub 只读 API 读取 commit metadata，不执行 PR 中的代码。

如果雇主、客户、学校或其他机构可能拥有相关权利，请先取得授权。大额、机构级、权属复杂或专利敏感的贡献可能在合并前需要单独书面协议；请先开 issue，且不要放入机密材料。这是少数复杂贡献的维护者复核，不是普通修复和功能的日常门槛。

## 准备 fork 与工具链

请使用 Git、Node.js 22.x 和 pnpm 9.7.0。Windows、macOS、Linux 的安装方式及 Docker 替代路径见 [README](./README.zh-CN.md#对新手友好的快速开始)。先在 GitHub fork 仓库，再将下方 `YOUR_ACCOUNT` 换成自己的账号：

```bash
git clone https://github.com/YOUR_ACCOUNT/rinspace-web.git
cd rinspace-web
git remote add upstream https://github.com/rinspacehq/rinspace-web.git
git remote -v
corepack enable
corepack prepare pnpm@9.7.0 --activate
pnpm install --frozen-lockfile
```

如果 Corepack 无法创建全局 shim，可把每条 `pnpm ...` 写成 `corepack pnpm ...`。如果没有 Corepack 但 npm 正常，运行 `npm install --global pnpm@9.7.0`。不要用 `npm install` 安装仓库依赖，也不要在没有明确依赖变更时重新生成 `pnpm-lock.yaml`。

首次 commit 前配置作者身份，可以使用 GitHub `noreply` 邮箱：

```bash
git config user.name "Your Name"
git config user.email "YOUR_ID+YOUR_ACCOUNT@users.noreply.github.com"
```

## 修改并验证

从最新 upstream 创建一个目标单一的分支：

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch -c fix/short-description
```

运行 `pnpm start` 启动 demo。分支前缀可以使用 `fix/`、`feat/`、`docs/` 或 `test/`；不要在同一个 PR 混入无关清理。Demo 必须保持确定性，只用合成数据，并在请求没有明确归属时失败关闭，绝不能回退到生产或未知外部服务。

开发过程中先跑最小相关测试。提交前从仓库根目录运行基础检查：

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
git diff --check
git status --short
```

浏览器可见行为要增加或更新 Playwright 覆盖，并运行 `package.json` 中对应的浏览器测试。涉及打包、容器、runtime 配置、路由、契约或翻译时，运行 README 对应检查。共享行为变化时同时更新 `README.md` 与 `README.zh-CN.md`。

逐个检查修改文件，然后创建带 sign-off 的 commit：

```bash
git diff
git add path/to/changed-file path/to/test-file
git commit -s -m "fix(scope): describe the user-visible result"
git show --stat --oneline HEAD
```

没有复核 untracked 文件前不要直接 `git add .`。好的 commit 标题使用祈使语气、描述具体，通常不超过 72 个字符；常见类型包括 `fix`、`feat`、`docs`、`test`、`refactor`、`build` 和 `ci`。

## 使用 Codex 或其他代码 AI

先阅读 [`AGENTS.md`](./AGENTS.md)。欢迎使用 AI，但人类贡献者仍然对正确性、安全、第三方权利、测试和 DCO 确认负责。绝不能把生产数据或凭据交给 AI；大量生成或复制内容需要在 PR 中披露其来源。

复制并填写以下提示词：

```text
请在当前 Rinspace Web 仓库工作。修改前阅读 AGENTS.md、README.zh-CN.md、CONTRIBUTING.zh-CN.md、package.json 和相关测试。

目标：<一个具体、用户可见的结果>
验收标准：
- <必须可观察到的行为或必须通过的失败测试>
- <边界情况以及安全/隐私预期>
约束：
- 修改聚焦，保留无关工作；除非明确要求，不破坏公开 API 兼容性。
- Demo 只用合成数据；不得加入凭据、私有 endpoint、生产 fallback 或未经复核的依赖。
- 共享行为变化时同步更新中英文文档。
验证：
- 迭代时运行最小相关测试。
- 交付前运行 pnpm check、pnpm lint、pnpm test，以及 <该功能特有的命令>。
交付：
- 汇总修改文件、行为、命令与结果、剩余风险和未验证项。
- 展示 git diff/status。除非我明确要求，不要 commit、push、部署或创建 PR。

如果目标与仓库的安全或许可规则冲突，停止并解释冲突，不要削弱门禁。
```

让 AI 协助本机或服务器部署时，请使用专门的 [Codex 部署提示词](./docs/ai-deployment.zh-CN.md)。

## 提交 Pull Request

- 运行 `git push -u origin fix/short-description`，然后从自己的 fork 向 `rinspacehq/rinspace-web:main` 创建 PR。
- 标题要清晰；正文说明问题、用户可见结果、实现边界、安全/隐私影响、实际测试、视觉变化截图、兼容/迁移影响和回滚方式。
- 只有在合并后确实应该关闭 issue 时才写 `Fixes #123`；未完成的工作请先标记 Draft。
- 修复和新行为都应有测试。不能运行的检查要说明原因，不能把未运行的检查写成通过。
- 不能为让 CI 通过而削弱 runtime 校验、origin 检查、秘密扫描、第三方清单、许可证 notice 或发布门禁。
- 每个新增依赖、复制片段、字体、图片、模板、生成 binary 或其他第三方输入，都要披露准确来源和许可证。
- 说明是否使用 AI 以及人工复核了什么；AI 披露不能替代来源/许可证披露和 DCO sign-off。
- 遵守 [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)。

维护者可以拒绝贡献或要求修改。提交不保证合并、付费、雇佣、支持或发布时间。
