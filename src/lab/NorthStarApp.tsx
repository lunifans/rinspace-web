import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowUp, Bell, BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, Code2,
  Heart, Menu, MessageCircle, Moon, MoreHorizontal, PenLine, Save, Search,
  Settings2, Sparkles, Sun, UserPlus,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';

import {
  AnimateAvatarGroup, AnimateButton, AnimateIconButton,
  AnimateTabs, AnimateTabsContent, AnimateTabsList, AnimateTabsTrigger,
} from '@/components/ui';

type Screen = 'home' | 'detail' | 'profile' | 'workspace';
type Theme = 'light' | 'dark';

const authors = [
  { name: '凌清', initials: 'LQ', tone: '#2b577a' },
  { name: '月见', initials: 'YJ', tone: '#6b5b95' },
  { name: 'Sigma', initials: 'Σ', tone: '#4a6f63' },
];

const articles = [
  { kind: '文章', title: '从几何直觉到谱序列：一次关于“看见结构”的讨论', excerpt: '我们常把证明写成线性的，但发现过程更像在多个局部坐标之间来回移动。这里尝试保留那些真正产生理解的中间步骤。', author: '凌清', meta: '12 分钟阅读 · 38 赞', mark: 'A' },
  { kind: '问题', title: '为什么紧致性能够把局部控制提升为全局结论？', excerpt: '设 X 为紧致 Hausdorff 空间。除了有限子覆盖的标准论证，是否存在更能解释其机制的视角？', author: '月见', meta: '6 个回答 · 2 小时前', mark: 'Q' },
  { kind: '书籍', title: 'Algebraic Topology · 第三章共读笔记', excerpt: '围绕上同调环、Künneth 公式与对偶性整理出的阅读路线，包含可计算例子和错误记录。', author: 'Sigma', meta: '24 个小节 · 本周更新', mark: 'B' },
  { kind: '动态', title: '一个适合验证交换图的小工具', excerpt: '把局部交换条件写成可运行的断言，尤其适合多人协作时检查符号约定。', author: '林间', meta: '9 条讨论 · 昨天', mark: 'D' },
];

function Brand() {
  return <div className="ns-brand"><span>R</span><b>Rinspace</b><small>以 Tag 为核心的长文社区</small></div>;
}

function Topbar({ onScreen }: { onScreen: (screen: Screen) => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="ns-topbar">
      <AnimateIconButton className="ns-mobile-menu" icon={<Menu />} label="打开导航" />
      <AnimateButton unstyled className="ns-brand-button" onClick={() => onScreen('home')} type="button"><Brand /></AnimateButton>
      <motion.div className="ns-search" animate={{ width: searchOpen ? 420 : 300 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
        <Search aria-hidden="true" />
        <input aria-label="搜索 Rinspace" onBlur={() => setSearchOpen(false)} onFocus={() => setSearchOpen(true)} placeholder="搜索文章、问题、Tag…" />
        <kbd>⌘ K</kbd>
      </motion.div>
      <nav aria-label="主导航"><AnimateButton unstyled onClick={() => onScreen('home')} type="button">发现</AnimateButton><AnimateButton unstyled onClick={() => onScreen('detail')} type="button">阅读</AnimateButton><AnimateButton unstyled onClick={() => onScreen('profile')} type="button">社区</AnimateButton></nav>
      <div className="ns-top-actions">
        <AnimateIconButton icon={<Bell />} label="通知" />
        <AnimateButton leadingIcon={<PenLine />} onClick={() => onScreen('workspace')} size="sm" variant="primary">创作</AnimateButton>
        <AnimateButton unstyled className="ns-avatar-button" onClick={() => onScreen('profile')} type="button">凌</AnimateButton>
      </div>
    </header>
  );
}

function PublicationCard({ item, index }: { item: typeof articles[number]; index: number }) {
  const [liked, setLiked] = useState(false);
  return (
    <motion.article className="ns-publication" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .045, duration: .26 }}>
      <div className="ns-pub-mark" data-kind={item.mark}>{item.mark}</div>
      <div className="ns-pub-copy">
        <span className="ns-eyebrow">{item.kind}</span>
        <h2>{item.title}</h2>
        <p>{item.excerpt}</p>
        <footer><span className="ns-mini-avatar">{item.author.slice(0, 1)}</span><strong>{item.author}</strong><span>{item.meta}</span></footer>
      </div>
      <div className="ns-pub-actions"><AnimateIconButton active={liked} icon={<Heart fill={liked ? 'currentColor' : 'none'} />} label={liked ? '取消喜欢' : '喜欢'} onClick={() => setLiked((value) => !value)} /><AnimateIconButton icon={<Bookmark />} label="收藏" /></div>
    </motion.article>
  );
}

function HomeScreen() {
  return (
    <main className="ns-page ns-home">
      <section className="ns-home-intro"><div><span className="ns-kicker">今日 Rinspace</span><h1>让严谨的知识，也拥有舒展的表达。</h1></div><p>从一个问题出发，沿着 Tag、长文与共同阅读，建立可以继续生长的理解。</p></section>
      <AnimateTabs defaultValue="selected">
        <div className="ns-filter-row"><AnimateTabsList><AnimateTabsTrigger value="selected">精选</AnimateTabsTrigger><AnimateTabsTrigger value="following">关注</AnimateTabsTrigger><AnimateTabsTrigger value="latest">最新</AnimateTabsTrigger></AnimateTabsList><AnimateButton leadingIcon={<Settings2 />} size="sm" variant="ghost">筛选</AnimateButton></div>
        <AnimateTabsContent value="selected">
          <div className="ns-discovery-grid"><div className="ns-stream">{articles.slice(0, 2).map((item, index) => <PublicationCard item={item} index={index} key={item.title} />)}</div><div className="ns-stream ns-stream-offset">{articles.slice(2).map((item, index) => <PublicationCard item={item} index={index + 2} key={item.title} />)}</div><aside className="ns-rail"><section><span className="ns-eyebrow">正在发生</span><h3>本周共同阅读</h3><p>《Visual Complex Analysis》第二章：把解析映射重新看成几何变换。</p><div className="ns-rail-row"><AnimateAvatarGroup identities={authors} label="参与阅读的成员" /><span>27 人参与</span></div><AnimateButton size="sm" variant="quiet">进入共读 <ChevronRight /></AnimateButton></section><section><span className="ns-eyebrow">Tag 轨道</span>{['代数拓扑', '复分析', '范畴论', '科学史'].map((tag, index) => <div className="ns-tag-row" key={tag}><b>{tag}</b><span>{28 - index * 5} 篇</span></div>)}</section></aside></div>
        </AnimateTabsContent>
        <AnimateTabsContent value="following"><div className="ns-state">你关注的作者刚刚更新了 3 篇长文。</div></AnimateTabsContent>
        <AnimateTabsContent value="latest"><div className="ns-state">最新内容会按真实发布时间呈现。</div></AnimateTabsContent>
      </AnimateTabs>
    </main>
  );
}

function DetailScreen() {
  const [voted, setVoted] = useState(false);
  return (
    <main className="ns-page ns-detail">
      <div className="ns-detail-grid"><aside className="ns-vote"><AnimateIconButton active={voted} icon={<ArrowUp />} label="赞同这个问题" onClick={() => setVoted((value) => !value)} /><motion.strong key={String(voted)} initial={{ scale: .7 }} animate={{ scale: 1 }}>{voted ? 129 : 128}</motion.strong><AnimateIconButton icon={<Bookmark />} label="收藏问题" /></aside><article className="ns-reading-sheet"><header><span className="ns-kicker">问题 · 代数拓扑</span><h1>为什么紧致性能够把局部控制提升为全局结论？</h1><p className="ns-deck">我希望理解的不是又一个有限子覆盖证明，而是紧致性在不同数学语言中反复出现的共同机制。</p><div className="ns-author-line"><span className="ns-author-avatar">月</span><div><strong>月见</strong><small>编辑于 2 小时前 · 阅读 1,842</small></div><AnimateButton leadingIcon={<UserPlus />} size="sm" variant="quiet">关注</AnimateButton></div></header><div className="ns-prose"><p>设 <i>X</i> 为紧致 Hausdorff 空间。局部上，我们可以为每个点选择一个满足估计的邻域：</p><div className="ns-math">∀x ∈ X, ∃ Uₓ ∋ x, ‖f(y) − f(x)‖ &lt; ε</div><p>标准论证选取有限子覆盖。但这个“有限”并不是技术收尾：它把不可同时管理的无穷局部信息压缩成一次可以完成的选择。</p><blockquote>紧致性并不制造全局结构；它保证局部证据能够被有限地见证。</blockquote><h2>从开覆盖到函子观点</h2><p>若把局部数据看作一个图，那么紧致性控制的是验证全局命题所需的数据规模。这个视角也解释了它为什么会在一致连续、极值定理和测度紧性中反复出现。</p><pre><code>{`cover(X).finite_subcover()\n  .map(local_estimate)\n  .combine(global_bound)`}</code></pre></div><footer className="ns-reading-actions"><AnimateButton leadingIcon={<Heart />} variant="quiet">感谢这个问题</AnimateButton><AnimateButton leadingIcon={<MessageCircle />} variant="ghost">6 个回答</AnimateButton></footer></article><aside className="ns-detail-rail"><section><span className="ns-eyebrow">回答者</span><AnimateAvatarGroup identities={authors} label="已回答成员" /><p>6 个回答正在从几何、分析和范畴三个方向展开。</p><AnimateButton size="sm" variant="primary">写回答</AnimateButton></section><section><span className="ns-eyebrow">相关路径</span><a href="#uniform">一致连续性的真正含义 <ChevronRight /></a><a href="#sheaf">从层的粘合条件理解局部到整体 <ChevronRight /></a></section></aside></div>
    </main>
  );
}

function ProfileScreen() {
  return (
    <main className="ns-page ns-profile"><section className="ns-profile-hero"><div className="ns-cover"><div className="ns-orbit" /></div><div className="ns-profile-identity"><div className="ns-profile-avatar">凌</div><div><span className="ns-kicker">上海 · 数学写作者</span><h1>凌清</h1><p>在拓扑、视觉与写作之间寻找可以传递的结构。正在整理一本关于证明直觉的开放笔记。</p><div className="ns-profile-meta"><b>128</b><span>文章</span><b>4.8k</b><span>关注者</span><b>36</b><span>共同编辑</span></div></div><div className="ns-profile-actions"><AnimateButton leadingIcon={<UserPlus />} variant="primary">关注</AnimateButton><AnimateIconButton icon={<MoreHorizontal />} label="更多操作" /></div></div></section><AnimateTabs defaultValue="writing"><AnimateTabsList><AnimateTabsTrigger value="writing">长文 128</AnimateTabsTrigger><AnimateTabsTrigger value="questions">问题 42</AnimateTabsTrigger><AnimateTabsTrigger value="books">书籍 3</AnimateTabsTrigger><AnimateTabsTrigger value="activity">动态</AnimateTabsTrigger></AnimateTabsList><AnimateTabsContent value="writing"><div className="ns-profile-grid"><section><span className="ns-eyebrow">置顶系列</span><h2>证明之前：数学直觉如何形成</h2><p>一组关于例子、反例、图像和符号选择的长文。这里保留推理真正转向的时刻。</p><div className="ns-series-progress"><motion.span initial={{ width: 0 }} animate={{ width: '68%' }} /><small>已完成 17 / 25 节</small></div></section><div className="ns-profile-list">{articles.slice(0, 3).map((item) => <article key={item.title}><span>{item.kind}</span><h3>{item.title}</h3><small>{item.meta}</small></article>)}</div></div></AnimateTabsContent><AnimateTabsContent value="questions"><div className="ns-state">42 个问题构成了她最近的研究轨迹。</div></AnimateTabsContent><AnimateTabsContent value="books"><div className="ns-state">3 本持续更新的开放书籍。</div></AnimateTabsContent><AnimateTabsContent value="activity"><div className="ns-state">编辑、评论与共同阅读活动。</div></AnimateTabsContent></AnimateTabs></main>
  );
}

function WorkspaceScreen() {
  const [saved, setSaved] = useState(true);
  return (
    <main className="ns-workspace"><aside className="ns-workspace-tree"><div className="ns-workspace-title"><BookOpen /><div><b>证明之前</b><small>开放书籍</small></div></div><AnimateButton unstyled className="active" type="button"><span>01</span>为什么先找反例</AnimateButton><AnimateButton unstyled type="button"><span>02</span>图像不是证明</AnimateButton><AnimateButton unstyled type="button"><span>03</span>选择正确的符号</AnimateButton><AnimateButton unstyled type="button"><span>04</span>局部与整体</AnimateButton><AnimateButton leadingIcon={<Sparkles />} size="sm" variant="ghost">新建小节</AnimateButton></aside><section className="ns-editor"><header><div><span className="ns-kicker">第三章 · 草稿</span><input aria-label="章节标题" defaultValue="图像不是证明，但它决定我们寻找什么证明" /></div><div className="ns-save-state">{saved ? <><Check />已保存</> : <><span className="rin-ui-spinner" />保存中</>}<AnimateButton leadingIcon={<Save />} onClick={() => { setSaved(false); window.setTimeout(() => setSaved(true), 700); }} size="sm" variant="secondary">保存</AnimateButton><AnimateButton size="sm" variant="primary">发布</AnimateButton></div></header><div className="ns-editor-tools"><AnimateIconButton icon={<ChevronLeft />} label="返回" /><span /><AnimateIconButton icon={<Code2 />} label="插入代码" /><AnimateIconButton icon={<Bookmark />} label="插入引用" /></div><div className="ns-editor-body" contentEditable suppressContentEditableWarning><p className="ns-editor-placeholder">写作不是把已经完整的思想抄下来，而是在句子之间发现思想缺失的部分。</p><h2>从一个错误的图开始</h2><p>考虑复函数 <i>f(z) = z²</i>。第一幅草图通常会让我们误以为角度只是被“拉开”，但真正稳定的描述应当同时说明模与辐角：</p><div className="ns-math">|f(z)| = |z|²,　arg f(z) = 2 arg z</div><p>图像没有替代证明。它为证明选择了需要保持不变的量，并让错误的命题更早暴露。</p></div><footer><span>624 字 · 预计阅读 4 分钟</span><span>自动保存开启</span></footer></section><aside className="ns-inspector"><span className="ns-eyebrow">发布设置</span><label>主要 Tag<input defaultValue="数学写作" /></label><label>可见性<select defaultValue="public"><option value="public">公开</option><option value="draft">仅自己</option></select></label><div><b>大纲</b><a href="#wrong">从一个错误的图开始</a><a href="#invariant">寻找不变量</a><a href="#proof">回到证明</a></div></aside></main>
  );
}

function Frame({ children, screen, setScreen }: { children: ReactNode; screen: Screen; setScreen: (screen: Screen) => void }) {
  return <><Topbar onScreen={setScreen} /><AnimatePresence mode="wait"><motion.div key={screen} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .2 }}>{children}</motion.div></AnimatePresence></>;
}

export function NorthStarApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [theme, setTheme] = useState<Theme>('light');
  const [reduced, setReduced] = useState(false);
  const [rtl, setRtl] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; document.documentElement.dir = rtl ? 'rtl' : 'ltr'; }, [rtl, theme]);
  const screenContent = screen === 'home' ? <HomeScreen /> : screen === 'detail' ? <DetailScreen /> : screen === 'profile' ? <ProfileScreen /> : <WorkspaceScreen />;
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'} transition={{ duration: .22 }}>
      <div className="ns-app"><aside className="ns-lab-toolbar" aria-label="设计实验室控制"><span>V2 NORTH STAR</span>{(['home', 'detail', 'profile', 'workspace'] as Screen[]).map((item) => <AnimateButton unstyled aria-pressed={screen === item} key={item} onClick={() => setScreen(item)} type="button">{item}</AnimateButton>)}<i /><AnimateIconButton icon={theme === 'light' ? <Moon /> : <Sun />} label="切换主题" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} /><AnimateButton unstyled aria-pressed={reduced} onClick={() => setReduced((value) => !value)} type="button">减弱动态</AnimateButton><AnimateButton unstyled aria-pressed={rtl} onClick={() => setRtl((value) => !value)} type="button">RTL</AnimateButton></aside><Frame screen={screen} setScreen={setScreen}>{screenContent}</Frame></div>
    </MotionConfig>
  );
}
