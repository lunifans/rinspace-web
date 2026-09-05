import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useBootstrap } from "@/app/bootstrap/context";
import { demoWorldPosts, type DemoWorldRoute } from "./worldContract";

function metric(value: number, label: string) {
  return (
    <span>
      <strong>{value}</strong> {label}
    </span>
  );
}

function PostCard({ post }: { post: (typeof demoWorldPosts)[number] }) {
  const { t } = useTranslation("common");
  return (
    <article className="rin-demo-world-post" data-demo-post-id={post.id}>
      <header>
        <Link to={`/@${post.username}?world=inner`}>
          <strong>{post.author}</strong>
        </Link>
        <span>@{post.username}</span>
      </header>
      <Link
        className="rin-demo-world-post-body"
        to={`/p/${post.id}/${post.slug}`}
      >
        {post.body}
      </Link>
      <Link className="rin-demo-world-tag" to={`/tags/${post.tag}?world=inner`}>
        #{post.tag}
      </Link>
      <footer aria-label={t("demo.world.metrics")}>
        {metric(post.replies, t("demo.world.reply"))}
        {metric(post.reposts, t("demo.world.repost"))}
        {metric(post.likes, t("demo.world.like"))}
        {metric(post.views, t("demo.world.view"))}
        <span>{t("demo.world.bookmark")}</span>
        <span>{t("demo.world.share")}</span>
      </footer>
    </article>
  );
}

function InnerWorldHome({ degraded }: { degraded: boolean }) {
  const { t } = useTranslation("common");
  const { config } = useBootstrap();
  const canonicalUrl = new URL(
    "/?world=inner",
    config.canonicalOrigin,
  ).toString();
  return (
    <main className="rin-demo-world-page" data-demo-world="inner">
      <Helmet>
        <title>{t("demo.world.innerTitle")} · Rinspace</title>
        <meta name="description" content={t("demo.world.previewBoundary")} />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>
      <header className="rin-demo-world-intro">
        <span>{t("demo.world.kicker")}</span>
        <h1>{t("demo.world.innerTitle")}</h1>
        <p>{t("demo.world.previewBoundary")}</p>
      </header>

      {degraded ? (
        <section
          className="rin-demo-world-state"
          role="status"
          data-demo-world-state="degraded"
        >
          <strong>{t("demo.world.degradedTitle")}</strong>
          <p>{t("demo.world.degradedMessage")}</p>
          <Link to="/?world=inner">{t("demo.world.retryNormal")}</Link>
        </section>
      ) : (
        <section
          className="rin-demo-world-feed"
          aria-label={t("demo.world.feed")}
        >
          {demoWorldPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </section>
      )}

      <aside
        className="rin-demo-world-lab"
        aria-labelledby="rin-demo-world-lab-title"
      >
        <div>
          <span>{t("demo.world.contractLab")}</span>
          <h2 id="rin-demo-world-lab-title">{t("demo.world.tryRoutes")}</h2>
        </div>
        <nav>
          <Link to="/@demo-orbit-reader">{t("demo.world.accountOuter")}</Link>
          <Link to="/@demo-orbit-reader?world=inner">
            {t("demo.world.accountInner")}
          </Link>
          <Link to="/tags/204/reproducibility">{t("demo.world.tagOuter")}</Link>
          <Link to="/tags/reproducibility?world=inner">
            {t("demo.world.tagInner")}
          </Link>
          <Link to="/books">{t("demo.world.singlePage")}</Link>
          <Link to="/p/7001001">{t("demo.world.shortPost")}</Link>
          <Link to="/p/7001001/not-the-current-slug">
            {t("demo.world.wrongSlug")}
          </Link>
          <Link to="/?world=inner&demoState=degraded">
            {t("demo.world.degraded")}
          </Link>
        </nav>
      </aside>
    </main>
  );
}

function PostPage({
  route,
}: {
  route: Extract<DemoWorldRoute, { kind: "post" }>;
}) {
  const { t } = useTranslation("common");
  const { config } = useBootstrap();
  const canonicalUrl = route.canonicalPath
    ? new URL(route.canonicalPath, config.canonicalOrigin).toString()
    : null;
  if (!route.post) {
    return (
      <main
        className="rin-demo-world-page rin-demo-world-post-page"
        data-demo-post-state="not-found"
      >
        <section className="rin-demo-world-state" role="status">
          <strong>{t("demo.world.postNotFoundTitle")}</strong>
          <p>{t("demo.world.postNotFoundMessage")}</p>
          <Link to="/?world=inner">{t("demo.world.backInner")}</Link>
        </section>
      </main>
    );
  }
  return (
    <main
      className="rin-demo-world-page rin-demo-world-post-page"
      data-demo-post-state={route.slugState}
    >
      <Helmet>
        <title>{route.post.body.slice(0, 36)} · Rinspace</title>
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
      </Helmet>
      {route.slugState !== "canonical" ? (
        <section className="rin-demo-world-state" role="status">
          <strong>
            {route.slugState === "missing"
              ? t("demo.world.shortResolved")
              : t("demo.world.wrongResolved")}
          </strong>
          <p>{t("demo.world.stableIdExplanation")}</p>
          <Link to={route.canonicalPath || "/?world=inner"}>
            {t("demo.world.openCanonical")}
          </Link>
        </section>
      ) : null}
      <PostCard post={route.post} />
      <Link className="rin-demo-world-back" to="/?world=inner">
        {t("demo.world.backInner")}
      </Link>
    </main>
  );
}

export default function DemoWorldContractPage({
  route,
}: {
  route: DemoWorldRoute;
}) {
  return route.kind === "inner-home" ? (
    <InnerWorldHome degraded={route.degraded} />
  ) : (
    <PostPage route={route} />
  );
}
