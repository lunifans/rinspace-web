# Demo route coverage / 演示路由覆盖

This table is generated from the repository-owned route manifest and its audited demo-support association. Do not edit it by hand.

本表由仓库内的路由 manifest 与经审计的 demo-support 关联表生成，不应手工修改。

Generic static hosting provides one runtime-configured site shell and BrowserRouter fallback. It does not provide per-request HTML/SSR metadata for dynamic content; the official Go shell consumes `contracts/route-metadata.json` for that integration.

通用静态托管只提供一份运行时配置的站点外壳与 BrowserRouter fallback，不提供动态内容的逐请求 HTML/SSR metadata；官方 Go 外壳通过 `contracts/route-metadata.json` 集成。

Summary: Interactive / 可交互 48; Read-only / 只读 22; Production-only / 仅生产 11; Not yet supported / 暂未支持 4.

| Route | Family | Demo support | Minimum role | Playwright path | Guest | Member |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | discovery | Interactive / 可交互 | none | `/` | render | render |
| `/about` | account-policy | Read-only / 只读 | none | `/about` | render | render |
| `/legal` | account-policy | Read-only / 只读 | none | `/legal` | render | render |
| `/terms` | account-policy | Read-only / 只读 | none | `/terms` | render | render |
| `/privacy` | account-policy | Read-only / 只读 | none | `/privacy` | render | render |
| `/copyright` | account-policy | Read-only / 只读 | none | `/copyright` | render | render |
| `/contact` | account-policy | Read-only / 只读 | none | `/contact` | render | render |
| `/sponsor` | account-policy | Production-only / 仅生产 | none | `/sponsor` | capability-boundary | capability-boundary |
| `/sponsor/supporters` | account-policy | Production-only / 仅生产 | none | `/sponsor/supporters` | capability-boundary | capability-boundary |
| `/sponsor/supporters/:orderNo` | account-policy | Production-only / 仅生产 | none | `/sponsor/supporters/demo-order` | capability-boundary | capability-boundary |
| `/sponsor/alipay/return` | account-policy | Production-only / 仅生产 | none | `/sponsor/alipay/return` | capability-boundary | capability-boundary |
| `/search` | discovery | Read-only / 只读 | none | `/search` | render | render |
| `/test/computer` | knowledge | Not yet supported / 暂未支持 | none | `/test/computer` | unsupported-explanation | unsupported-explanation |
| `/creator` | creation | Interactive / 可交互 | member | `/creator` | authentication-outcome | render |
| `/write` | creation | Interactive / 可交互 | member | `/write` | authentication-outcome | render |
| `/write/markdown` | creation | Interactive / 可交互 | member | `/write/markdown` | authentication-outcome | render |
| `/questions` | discovery | Read-only / 只读 | none | `/questions` | render | render |
| `/questions/ask` | creation | Interactive / 可交互 | member | `/questions/ask` | authentication-outcome | render |
| `/tags` | discovery | Read-only / 只读 | none | `/tags` | render | render |
| `/tags/new` | creation | Not yet supported / 暂未支持 | member | `/tags/new` | authentication-outcome | unsupported-explanation |
| `/tags/:tagId/info/history/:tagSlug` | knowledge | Production-only / 仅生产 | none | `/tags/201/info/history/reproducibility` | capability-boundary | capability-boundary |
| `/tags/:tagId/info/:tagSlug` | knowledge | Interactive / 可交互 | none | `/tags/201/info/reproducibility` | render | render |
| `/tags/:tagId/edit/:tagSlug` | creation | Production-only / 仅生产 | member | `/tags/201/edit/reproducibility` | authentication-outcome | capability-boundary |
| `/tags/:tagId/:tagSlug` | knowledge | Interactive / 可交互 | none | `/tags/201/reproducibility` | render | render |
| `/tags/:tagName/info/history` | knowledge | Production-only / 仅生产 | none | `/tags/reproducibility/info/history` | capability-boundary | capability-boundary |
| `/tags/:tagName/info` | knowledge | Interactive / 可交互 | none | `/tags/reproducibility/info` | render | render |
| `/tags/:tagId/:tagTitle/edit` | creation | Production-only / 仅生产 | member | `/tags/201/reproducibility/edit` | authentication-outcome | capability-boundary |
| `/tags/:tagId/edit` | creation | Production-only / 仅生产 | member | `/tags/201/edit` | authentication-outcome | capability-boundary |
| `/tags/:tagId/:tagTitle` | knowledge | Interactive / 可交互 | none | `/tags/201/reproducibility` | render | render |
| `/tags/:tagName` | knowledge | Interactive / 可交互 | none | `/tags/reproducibility` | render | render |
| `/badges` | identity | Read-only / 只读 | none | `/badges` | render | render |
| `/blog` | discovery | Read-only / 只读 | none | `/blog` | render | render |
| `/blogs` | routing | Read-only / 只读 | none | `/blogs` | render | render |
| `/books` | discovery | Read-only / 只读 | none | `/books` | render | render |
| `/books/new` | creation | Interactive / 可交互 | member | `/books/new` | authentication-outcome | render |
| `/books/:slug/edit` | creation | Interactive / 可交互 | member | `/books/paper-to-orbit/edit` | authentication-outcome | render |
| `/books/:postId/workspace/markdown/:sectionId` | creation | Interactive / 可交互 | member | `/books/1040/workspace/markdown/state-vector` | authentication-outcome | render |
| `/books/:postId/workspace/sections/:sectionId` | creation | Interactive / 可交互 | member | `/books/1040/workspace/sections/state-vector` | authentication-outcome | render |
| `/books/:postId/workspace` | creation | Interactive / 可交互 | member | `/books/1040/workspace` | authentication-outcome | render |
| `/author/:authorId` | knowledge | Interactive / 可交互 | none | `/author/102` | render | render |
| `/books/:postId/:titleSlug/activity` | knowledge | Interactive / 可交互 | none | `/books/1040/paper-to-orbit/activity` | render | render |
| `/books/:postId/activity` | knowledge | Interactive / 可交互 | none | `/books/1040/activity` | render | render |
| `/books/:postId/read/:titleSlug` | knowledge | Interactive / 可交互 | none | `/books/1040/read/paper-to-orbit` | render | render |
| `/books/:postId/read` | knowledge | Interactive / 可交互 | none | `/books/1040/read` | render | render |
| `/books/:postId/:titleSlug` | knowledge | Interactive / 可交互 | none | `/books/1040/paper-to-orbit` | render | render |
| `/books/:postId` | knowledge | Interactive / 可交互 | none | `/books/1040` | render | render |
| `/test/a/:postId/:titleSlug` | knowledge | Not yet supported / 暂未支持 | none | `/test/a/1010/local-error-atlas` | unsupported-explanation | unsupported-explanation |
| `/test/a/:postId` | knowledge | Not yet supported / 暂未支持 | none | `/test/a/1010` | unsupported-explanation | unsupported-explanation |
| `/a/:postId/:titleSlug` | knowledge | Interactive / 可交互 | none | `/a/1010/local-error-atlas` | render | render |
| `/a/:postId` | knowledge | Interactive / 可交互 | none | `/a/1010` | render | render |
| `/blog/:slug` | knowledge | Interactive / 可交互 | none | `/blog/local-error-atlas` | render | render |
| `/q/:postId/:titleSlug` | knowledge | Interactive / 可交互 | none | `/q/1030/iterator-boundary-last-example` | render | render |
| `/q/:postId` | knowledge | Interactive / 可交互 | none | `/q/1030` | render | render |
| `/questions/:slug` | knowledge | Interactive / 可交互 | none | `/questions/iterator-boundary-last-example` | render | render |
| `/me` | identity | Interactive / 可交互 | member | `/me` | authentication-outcome | render |
| `/git-auth` | frozen-integration | Production-only / 仅生产 | member | `/git-auth` | authentication-outcome | capability-boundary |
| `/users` | discovery | Read-only / 只读 | none | `/users` | render | render |
| `/users/:username` | identity | Interactive / 可交互 | none | `/users/demo-orbit-reader` | render | render |
| `/users/:username/rank` | identity | Read-only / 只读 | none | `/users/demo-orbit-reader/rank` | render | render |
| `/:username/rank` | identity | Read-only / 只读 | none | `/demo-orbit-reader/rank` | render | render |
| `/:username` | identity | Interactive / 可交互 | none | `/demo-orbit-reader` | render | render |
| `/settings` | account-policy | Interactive / 可交互 | member | `/settings` | authentication-outcome | render |
| `/admin` | operations | Production-only / 仅生产 | member | `/admin` | authentication-outcome | authorization-outcome |
| `/linked/:questionId` | knowledge | Read-only / 只读 | none | `/linked/1030` | render | render |
| `/notifications` | identity | Interactive / 可交互 | member | `/notifications` | authentication-outcome | render |
| `/activity` | identity | Read-only / 只读 | none | `/activity` | render | render |
| `/announcements` | discovery | Read-only / 只读 | none | `/announcements` | render | render |
| `/announcements/new` | creation | Interactive / 可交互 | member | `/announcements/new` | authentication-outcome | render |
| `/announcements/:slug/edit` | creation | Interactive / 可交互 | member | `/announcements/local-demo-announcement/edit` | authentication-outcome | render |
| `/announcements/:slug` | knowledge | Interactive / 可交互 | none | `/announcements/local-demo-announcement` | render | render |
| `/discussions` | discovery | Read-only / 只读 | none | `/discussions` | render | render |
| `/discussions/new` | creation | Interactive / 可交互 | member | `/discussions/new` | authentication-outcome | render |
| `/discussions/:slug/edit` | creation | Interactive / 可交互 | member | `/discussions/diagrams-before-proof/edit` | authentication-outcome | render |
| `/d/:postId/:titleSlug` | knowledge | Interactive / 可交互 | none | `/d/1050/diagrams-before-proof` | render | render |
| `/d/:postId` | knowledge | Interactive / 可交互 | none | `/d/1050` | render | render |
| `/discussions/:slug` | knowledge | Interactive / 可交互 | none | `/discussions/diagrams-before-proof` | render | render |
| `/dynamics` | discovery | Read-only / 只读 | none | `/dynamics` | render | render |
| `/dynamics/new` | creation | Interactive / 可交互 | member | `/dynamics/new` | authentication-outcome | render |
| `/dynamics/:slug/edit` | creation | Interactive / 可交互 | member | `/dynamics/field-note-fixed-clock/edit` | authentication-outcome | render |
| `/s/:postId/:titleSlug` | knowledge | Interactive / 可交互 | none | `/s/1060/field-note-fixed-clock` | render | render |
| `/s/:postId` | knowledge | Interactive / 可交互 | none | `/s/1060` | render | render |
| `/dynamics/:slug` | knowledge | Interactive / 可交互 | none | `/dynamics/field-note-fixed-clock` | render | render |
| `/forum/:slug` | knowledge | Interactive / 可交互 | none | `/forum/diagrams-before-proof` | render | render |
| `/activity/:slug` | knowledge | Interactive / 可交互 | none | `/activity/field-note-fixed-clock` | render | render |
| `*` | routing | Read-only / 只读 | none | `/route-coverage-not-found` | render | render |
