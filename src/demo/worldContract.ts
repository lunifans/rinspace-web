export const demoWorldPosts = Object.freeze([
  Object.freeze({
    id: "7001001",
    slug: "local-first-community-design",
    author: "轨道读者",
    username: "demo-orbit-reader",
    body: "先把社区留在本地：统一身份、稳定链接和可验证的边界，比仓促打开联邦更重要。",
    tag: "reproducibility",
    replies: 12,
    reposts: 8,
    likes: 31,
    views: 428,
  }),
  Object.freeze({
    id: "7001002",
    slug: "one-account-two-editorial-views",
    author: "纸舟",
    username: "demo-paper-boat",
    body: "同一个账号、同一份资料和关注关系，可以在表世界组织知识，在里世界参与实时讨论。",
    tag: "mathematical-writing",
    replies: 5,
    reposts: 3,
    likes: 19,
    views: 267,
  }),
  Object.freeze({
    id: "7001003",
    slug: "routes-are-product-contracts",
    author: "North Window",
    username: "demo-north-window",
    body: "A URL is a product promise. The readable slug may change; the stable status ID must still find the same local post.",
    tag: "web-platform",
    replies: 4,
    reposts: 6,
    likes: 24,
    views: 315,
  }),
]);

export type DemoWorldPost = (typeof demoWorldPosts)[number];

export type DemoWorldRoute =
  | Readonly<{ kind: "inner-home"; degraded: boolean }>
  | Readonly<{
      kind: "post";
      post: DemoWorldPost | null;
      requestedSlug: string;
      canonicalPath: string | null;
      slugState: "canonical" | "missing" | "incorrect" | "not-found";
    }>;

function decodePathPart(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveDemoWorldRoute(
  pathname: string,
  search = "",
): DemoWorldRoute | null {
  if (pathname === "/") {
    const params = new URLSearchParams(search);
    if (params.get("world") !== "inner") return null;
    return {
      kind: "inner-home",
      degraded: params.get("demoState") === "degraded",
    };
  }

  const match = pathname.match(/^\/p\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  const id = decodePathPart(match[1]);
  const requestedSlug = decodePathPart(match[2]);
  const post = demoWorldPosts.find((candidate) => candidate.id === id) ?? null;
  if (!post) {
    return {
      kind: "post",
      post: null,
      requestedSlug,
      canonicalPath: null,
      slugState: "not-found",
    };
  }
  return {
    kind: "post",
    post,
    requestedSlug,
    canonicalPath: `/p/${post.id}/${post.slug}`,
    slugState:
      requestedSlug === ""
        ? "missing"
        : requestedSlug === post.slug
          ? "canonical"
          : "incorrect",
  };
}
