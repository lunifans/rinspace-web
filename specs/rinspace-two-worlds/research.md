# Rinspace 表里世界代码研究记录

> 状态：2026-09-05 完成第一轮代码与运行边界核查。本文件记录事实和设计输入，不等同于已确认技术方案。

## 1. 核查范围

- 当前线上 Rinspace 对应的私有仓库：`/home/ubuntu/rinspace`
- 后续公开前端主线：`/home/ubuntu/rinspace-web`
- Rinspace 的 Mastodon fork：`/home/ubuntu/upstreams/mastodon`
- 当前 Nginx 同源路由、运行容器和不含个人内容的数据库汇总
- 与本企划直接相关的既有规格：持久顶栏、首页社区卡片、标签 ID 路由、Rin Control Plane

核查时三个工作树均干净，并分别与各自 `origin/main` 一致：

| 工作树 | 基线提交 | 当前职责 |
| --- | --- | --- |
| `rinspace` | `d5e83cb83577e0935ebd20665782884de75643cd` | 当前线上后端、部署、私有适配器及旧 UI 基线 |
| `rinspace-web` | `d8878c0ddc10275f0ae0cac2ef726c418fcb5b20` | 未来公开浏览器源码、公开契约和确定性 Demo |
| Mastodon fork | `0a32b4a83...` | 里世界社区与 ActivityPub 上游基线 |

当前线上静态包仍由 `rinspace` 服务。`rinspace-web` 与私有仓库的 UI 已有明显分化；全目录差异涉及 209 个文件，因此不能再把私有 UI 当作公开前端的隐式主线，也不能假设线上包就是公开仓库的直接构建。

## 2. Rinspace Web 现状

### 2.1 应用外壳和顶栏

- `src/App.tsx` 只有一个 `BrowserRouter`，所有路由都处于一个 `SiteTopbarHost` 下。
- `SiteTopbarHost` 已经是常驻外壳；页面中的 `SiteTopbar` 只是注册会话刷新回调。
- 当前 Logo 图形和 `Rinspace` 文字被 `BrandNavigation` 包在同一个首页链接中，无法表达两个不同动作。
- 当前 Logo 自带 hover 旋转，但这只是装饰反馈，不是世界切换状态机。
- 顶栏同时承担搜索、发布、通知、登录、用户菜单和主题切换。世界切换不能通过复制第二套顶栏完成。

### 2.2 路由和元数据

- `routeManifest.tsx` 当前登记 85 条路由，但路由定义没有 `world`、双面资源或反面目标等信息。
- `/search`、`/settings`、`/notifications`、`/about` 和 `/@username` 将与 Mastodon 的网页路由发生语义重叠。
- `/@username` 目前实际上由宽泛的 `/:username` 捕获；这个兜底还会误接许多未来的 Mastodon 单段路径。
- `RouteDocument` 生成 canonical 时只使用 `location.pathname`，会丢弃用于区分世界的查询状态。
- 文章、书籍和标签已经采用“稳定 ID + 可读 slug”的方向；用户资料仍以 handle 为公开地址。

### 2.3 首页、个人页和标签页

- `HomePage` 约 2900 行，目前在一个页面内混合博客、问答、讨论、动态、书籍、标签和知识图谱。
- `ProfilePage` 约 4600 行，一次装载资料、粉丝、博客、书籍、问答、讨论、动态、收藏和知识图谱。它还没有“共享身份头部 + 两种内容投影”的边界。
- `TagDetail` 同时承担标签 Wiki、全部内容、问答、贡献者和治理信息，没有区分知识侧与社交侧。
- 结论：翻面不是给当前大页面加 `rotateY`。必须先建立世界状态和双面资源注册表，再把首页、个人页、标签页拆成共享身份与按世界加载的主体。

### 2.4 公开前端消费契约

公开仓库文档已经定义了正确方向：公开前端先提供版本化 OpenAPI、Demo 和不可变 release，私有仓库再锁定精确版本，不能消费 `main` 或 `latest`。但私有仓库中目前还没有文档所称的 `rinspace-web.lock.json`、`npm run dev:web` 或完整跨仓消费入口。这部分仍是待实现契约，而不是已经工作的流水线。

## 3. Rinspace 私有后端现状

### 3.1 账号资料

- 登录和本地资料保存在 Rinspace/CloudBase 一侧，主要落在 `profiles` 和 `users`。
- 公开资料包含 handle、昵称、头像、封面、简介、网站、地点和 about HTML。
- 当前 handle 允许小写字母、数字、连字符和下划线，长度 3–32；Mastodon 本地 username 只允许字母、数字、下划线，最长 30。
- 当前资料更新允许改变 handle。第一阶段不发布 ActivityPub actor；如果未来另行开放联邦，handle 生命周期必须在开放前重新设计，不能直接沿用普通资料字段的更新语义。

2026-09-05 对线上库只做了匿名汇总：当前 2 个本地账号都直接满足 Mastodon username 约束，没有读取或输出任何账号内容。数据规模很小，因此现在是统一用户名规则和冻结策略的低成本窗口。

### 3.2 关注关系

既有 Rin Control Plane 规格把 Gitea User Follow 定义为用户关注的基础事实，`SetFollow` 也已经把用户关注命令发给 Gitea 社交适配器。

Mastodon 的关注不是一个可随意镜像的布尔值。其 `FollowService`、`UnfollowService` 和模型同时管理：

- 本地直接关注与远端关注请求；
- 锁定账号的待批准状态；
- `show_reblogs`、通知和语言过滤；
- ActivityPub Follow/Undo/Accept/Reject 投递及 URI；
- 时间线合并、列表成员、计数器、通知、缓存和封禁约束。

这些是上游具备的能力；第一阶段只允许本地账号之间关注，不启用远端关系。即便如此，也不能让 Gitea 与 Mastodon 各自成为“粉丝真值”。产品层可由 Rinspace Control Plane 提供统一入口和统一读取，本地社交关系由 Mastodon 关系引擎执行并成为可投影的单一事实；Gitea 的 User Follow 需迁为兼容投影，Gitea Star/Watch 的内容语义不受影响。

### 3.3 标签

Rinspace 标签是稳定数字 ID 的知识对象，规范化允许空格、连字符和更广泛的 Unicode；Mastodon `Tag` 是 hashtag，`to_param` 直接使用规范化名称，语法不接受空格和连字符。

线上匿名汇总显示：26 个现行标签中约 16 个可直接作为 hashtag，10 个包含连字符。因此不能用字符串相等假装两者是同一模型。需要一个以 Rinspace tag ID 为中心、显式保存 Mastodon tag ID/name 和历史别名的绑定层。

### 3.4 推荐系统

私有 `rinspace` 已经接入独立 Gorse 服务，并通过统一用户 subject 与 `type:id` item ID 写入创建、回答、评论、关注、收藏/点赞和反对等反馈；博客、书籍、问答、讨论和动态也已有推荐读取路径。当前缺口不是“有没有推荐系统”，而是 Mastodon 本地帖还没有纳入这套 item、候选过滤和反馈契约。

因此，把个性化推荐排除在第一阶段之外没有代码基础。更合理的需求是：保留 Mastodon 非个性化关注时间线，同时将本地帖子及其获准互动接入既有 Gorse；推荐不可用或被用户关闭时，退化到本地热门或时间流。Gorse 只负责候选排序，不成为帖子、关注或互动的权威库。

## 4. Mastodon 现状

### 4.1 前端运行时

- Mastodon 当前使用 React 19.2.8、React Router 5.3.4、Redux Toolkit 和 Vite 8.2.1。
- `rinspace-web` 使用 React 19.2.8、React Router 7 和 Vite 6.4.3。
- Mastodon 由 Rails 生成 initial state，然后把完整应用挂载到 `#mastodon`；浏览器历史、Redux、streaming、CSRF、主题和 service worker 都以站点根为边界。
- Mastodon 新版导航是应用自己的左侧导航面板，移动端还有独立底部导航；并非可直接复制进 Rinspace 的普通页面组件。

这意味着把两个源码树强行编进一个 React Router，或用 iframe 包住 Mastodon，都会引入路由、焦点、滚动、认证、CSS、service worker 和上游升级问题。更可维护的候选方向是：两个应用保持独立运行时，共用一份可测试的 Rinspace 顶栏/世界协议，由同源入口按路径和显式世界状态分流，并使用跨文档 View Transition 提供连续翻面观感。最终选择仍需在需求确认后的设计阶段论证。

### 4.2 登录和资料

- Mastodon 原生支持 OpenID Connect，并支持 `OMNIAUTH_ONLY` 和 one-click SSO。
- 首次 OIDC 登录仍会创建 Mastodon `User` 和本地 `Account`；默认以 OIDC uid 推导 username，并在冲突时追加后缀。
- 该默认逻辑不满足“Rinspace handle 原样成为唯一 `@username`”的要求，需要稳定主体映射、预配账号以及字段级同步。
- Mastodon 的 display name 最长 40，note 最长 500，最多 4 个资料字段；与 Rinspace 资料字段和长度并不完全相同。

### 4.3 帖子互动能力

Mastodon 已原生提供回复、boost/repost、收藏式 favourite、书签、分享、引用、媒体、投票、内容警告、可见性、提及、通知、列表和关注请求。在本地基线提交 `0a32b4a83...` 中：

- `app/models/status_stat.rb` 只保存 `replies_count`、`reblogs_count`、`favourites_count` 和 `quotes_count`；
- `app/serializers/rest/status_serializer.rb` 与前端 `api_types/statuses.ts` 只公开上述互动计数；
- 全仓没有帖子 `views_count`、浏览事件或曝光去重实现。

所以 Mastodon 上游没有可直接复用的浏览量功能。“浏览量”必须成为 Rinspace fork 的新增能力，但应沿用现有 `StatusStat → REST Status → 前端 Status` 计数链路，不得把 favourite、reply、repost、quote 或后台页面请求次数改名冒充浏览量。什么构成一次有效浏览仍需作为产品口径确认。

### 4.4 推荐能力

Mastodon 上游提供 home timeline、local/public timeline、趋势帖子和个性化账号关注建议，但当前没有 X 式的通用个性化帖子“推荐”首页。Rinspace 已有 Gorse，因此候选架构是让 Mastodon 提供本地帖子、权限、互动和审核事实，由 Rinspace 私有服务筛选可见候选并调用 Gorse 排序，再以 Mastodon Status 契约返回；不能把 Gorse 直接暴露给浏览器。

### 4.5 标识符与路由

Mastodon 并不存在一套通用 slug 规则。公开或协议对象各自使用不同标识：

| 对象 | 现有标识/路径 | 对 Rinspace 的含义 |
| --- | --- | --- |
| 本地账号 | `/@username`，模型 `to_param = username` | 本地账号是双面资源 |
| 远端账号 | `/@username@domain` | Mastodon 上游能力；第一阶段禁止解析、抓取和展示 |
| 帖子 | Mastodon 原生为 `/@username/:statusId` | Rinspace 抛弃该浏览器地址，只提供 `/p/:id` 与 `/p/:id/:slug`，均按 status ID 定位 |
| hashtag | `/tags/:name`，模型 `to_param = name` | 通过 tag binding 对应 Rinspace tag ID |
| 媒体 | `/media/:shortcode-or-id` | 资源路由，不是帖子 slug |
| 会话 ActivityPub context | `/contexts/:accountId-:statusId` | 协议对象，不进入产品世界切换 |
| collection | `/collections/:id` 及账号 collection | 保留数字 ID 和协议语义 |
| list、poll、notification | 数字 ID、group key 或内部 token | 私有应用对象，不制造可读 slug |
| instance | domain | 管理/发现对象，不映射成 Rinspace 内容 |

ActivityPub actor、inbox、outbox、followers、following、status activity、replies、likes、shares、context、payload 和 WebFinger 路径是 Mastodon 上游协议身份。第一阶段应在公网入口关闭这些联邦能力，同时保留路由命名空间，避免产品网页占用后阻断未来升级。网页 URL 与未来可能启用的 ActivityPub URI 必须分开设计。

## 5. 已确认的产品约束

以下来自企划对话，视为需求输入而非待猜测项：

1. 表世界以书籍和博客为主，气质安静；里世界是 Mastodon/X 式活跃社区。
2. 两个世界是同一站点的两个状态，不使用 `/community` 把里世界降格为普通栏目。
3. `Rinspace` 文字回到当前世界首页；Logo 翻到反面。
4. 有双面的资源翻到同一资源的另一面；没有双面的资源回到另一世界首页。
5. 顶栏下方内容使用左右翻转效果；Logo 自身的视觉反馈可后置。
6. `/@username` 的两面是同一个账号、同一头像、同一资料和同一粉丝/关注关系，只是内容投影不同。
7. 标签可复用，但点击标签不得跨世界。
8. 帖子永久地址为 `/p/:id/:slug`；`/p/:id` 和错误 slug 都必须按 ID 正常到达帖子。
9. 讨论、问答、动态三个旧入口暂时保留，不在本期删除或合并历史数据。
10. Mastodon fork 的修改继续按 AGPL 开源。
11. 第一阶段严格限定为 Rinspace 本地社区：不接收远端帖子或账号，不抓取远端实例，不允许远端关注，也不向其他实例投递；联邦只能通过未来独立规格和合规核查启用。
12. 第一阶段应包含本地帖子算法推荐，同时保留用户可选择的非个性化关注/时间流。
13. handle 改名后，旧 `/@username` 不重定向到新地址。
14. 旧 handle 不为原账号永久保留；`@username` 只是当前个人主页入口，账号、关注关系、帖子作者和重要内容依靠固定内部 ID。
15. Mastodon 原生帖子网页 `/@username/:statusId` 不兼容、不重定向；Rinspace 帖子网页地址族只有 `/p/:id` 与 `/p/:id/:slug`。

## 6. 需求阶段建议基线

### 6.1 世界地址

建议把表世界作为默认状态，把 `world=inner` 作为仅用于“双面网页资源”的显式、可分享状态：

```text
/                         表世界首页
/?world=inner             里世界首页
/@alice                   Alice 的表世界资料
/@alice?world=inner       同一 Alice 的里世界资料
/p/123/hello-world        里世界专属帖子，无需重复 world 参数
/a/42/title               表世界专属文章，无需重复 world 参数
```

它满足“不新增 `/community` 路径”和“同一页面的两个状态”，又避免依赖 cookie、localStorage 或 history state 导致链接不可分享。`world` 只属于网页导航，不得进入 ActivityPub URI、REST API、媒体地址或静态资源地址。

### 6.2 运行与权威边界候选

| 领域 | 建议权威 | 其他系统 |
| --- | --- | --- |
| 本地登录主体、handle、共享资料 | Rinspace Identity | Mastodon 维护必要本地账号投影 |
| 本地用户关注生命周期 | Mastodon 关系引擎 | Rinspace Control Plane 提供统一命令/读取并保存可重建投影；Gitea 仅兼容投影 |
| 表世界文章、书籍、知识标签 | Rinspace/Gitea/Renderer 既有边界 | Mastodon 不复制正文权威 |
| 里世界帖子、回复、boost、like、bookmark、list、poll | Mastodon | Rinspace 只消费公开/受权 API 与事件 |
| 里世界本地帖子推荐 | Rinspace 私有推荐适配层与 Gorse | Mastodon 提供帖子、权限、审核和互动事实；Gorse 只排序候选 |
| 标签身份 | Rinspace tag ID | Mastodon hashtag 通过显式 binding 关联 |
| 世界路由与顶栏行为 | 公开、版本化的 Rinspace Web 契约 | 两个运行时分别实现同一契约 |
| 密钥、服务适配、同源路由和部署 | 私有 `rinspace` | 公开仓库不接触生产凭据 |

## 7. 设计阶段必须回答的问题

1. 是否确认使用 `world=inner` 区分只有路径本身无法区分的双面页面？
2. 是否接受“统一管理入口在 Rinspace、本地社交关系由 Mastodon 执行”的单图模型？
3. “推荐”和“正在关注”哪个是里世界首页初始标签，用户选择是否跨会话记忆？
4. 帖子 `views_count` 的有效曝光、去重、自有浏览和机器人排除口径是什么？
5. 顶栏共享采用源码包、生成契约还是双实现一致性测试；两个运行时如何完成跨文档翻转和失败回退？

已确认决策：第一阶段严格本地运行，且包含本地帖子个性化推荐；任何远端账号、帖子、关注、抓取、投递和联邦发现均不在本期范围。handle 改名后，旧 `/@username` 不重定向到新地址，也不为原账号永久保留；账号和关键内容依靠固定 ID 保持身份与归属。
