# Netlify 静态托管

Netlify 是首个特定平台的静态托管模板。Rinspace Web 仍只有一份源码和一个运行时中立 core：`prepare:netlify` 调用与 `pnpm package` 相同的实现，再把子路径 package 放入其真实 URL 前缀目录，同时把 `_headers` 与 `_redirects` 留在 publish root。

仓库当前故意不提供 **Deploy to Netlify** 按钮。源码模板和受控预览已经验证，但带凭据的 Netlify preview 与回滚尚需在私有发布候选中留下实际记录；在此之前不宣传一键部署。

## 根路径部署

`netlify.toml` 固定 Node 22.22.3、pnpm 9.7.0、build command、`netlify-dist` publish directory，并关闭 post-processing，避免平台改写带哈希的 core 字节。本地或指定 CI 的准备方式为：

```bash
pnpm install --frozen-lockfile
pnpm build
RINSPACE_STATIC_CONFIG=config/runtime.demo.json pnpm prepare:netlify
```

在 Netlify 关联仓库并保留文件化 build settings，或者上传指定 workflow 生成的完整 `netlify-dist/`。不能只上传 `index.html`。

## 子路径部署

所选配置的 `basePath`、canonical origin、API 路径、manifest scope 与 worker scope 必须使用同一个前缀：

```bash
RINSPACE_STATIC_CONFIG=config/runtime.demo.subpath.json \
RINSPACE_STATIC_OUTPUT=netlify-dist \
pnpm prepare:netlify
```

对于 `/rinspace-demo/`，应用文件位于 `netlify-dist/rinspace-demo/`，而 `_headers` 和 `_redirects` 位于 `netlify-dist/`。常规静态 CDN 必须使用这种物理嵌套。输出根还包含 `netlify-deploy.json`，绑定 base path、runtime-config 摘要、version 摘要和不可变 core 图。

## 运行时配置

`RINSPACE_STATIC_CONFIG` 必须指向 `config/` 下的常规 JSON 文件。部署系统也可通过 `RINSPACE_PUBLIC_RUNTIME_CONFIG_JSON` 提供完整的公开文档。它会经过 schema 校验并成为任何访客都能下载的 `runtime-config.json`，所以绝不能包含密码、数据库 URL、私钥、service token、内部 proxy target、管理员身份或真实用户数据。

同一个已审查 core 可在不重新编译的情况下用新公开配置反复组装：

```bash
pnpm prepare:netlify -- --core build --config config/runtime.example.json --out netlify-dist
```

受控测试会断言 runtime-config 摘要改变，但 immutable graph 摘要保持完全一致。

## 路由、headers 与缓存

- `_redirects` 使用 `200` rewrite，把配置 `basePath` 下的 splat 指向同前缀 `index.html`，BrowserRouter URL 不变。
- `_headers` 应用 CSP/安全 header，对 shell/config/worker/version 使用 `no-store`，对哈希资源使用一年 `immutable`，并设置精确的 `Service-Worker-Allowed` 前缀。
- 不存在的 JS、CSS、字体和其他资源必须保持 `404`；只有 HTML navigation 使用 SPA fallback。
- `static-headers.json` 是其他平台的中立事实来源。应精确翻译它，不能另造第二套缓存/安全策略。

## 受控验证

`Static Host Preview` workflow 只构建一次 core，在不重编译的情况下生成 root/subpath 两套布局，运行五项托管契约、package budget，并在 Chromium 验证深层路由直接刷新。针对既有 core 的等价本地检查为：

```bash
pnpm test:static-host
RINSPACE_ARTIFACT_DIR=netlify-dist pnpm exec playwright test tests/e2e/static-package.spec.ts --project=desktop-light
```

把某次 Netlify 部署称为“已验证”前，必须针对真实 preview URL 留下以下记录：

1. 根路径或指定子路径以及深层 URL 直接访问均返回应用；
2. `runtime-config.json` 为 `no-store`，worker scope 精确，哈希资源为 immutable；
3. 不存在的 `.js` 返回 `404` 而不是 HTML；
4. config-only deploy 改变 config/HTML，但 immutable asset hash 不变；
5. guest/member 流程没有意外外部或生产请求。

## 回滚

保存上一个成功 deploy ID 及其 `netlify-deploy.json`。在 Netlify 打开该成功 deploy，使用 **Publish Deploy** 把之前的原子 deploy 恢复为 live。如果自动发布仍启用，后续 Git production deploy 会覆盖这次回滚，因此应按需要锁定发布或回退源码变更。回滚后根据保存的 manifest 核对 `version.json`、`runtime-config.json`、深层路由、worker scope 和 immutable asset digest。
