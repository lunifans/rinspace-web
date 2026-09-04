const loaders: Record<string, () => Promise<unknown>> = {
  discovery: async () => {
    await import("@/styles/product-families/discovery.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return import("@/styles/product-families/dark-legacy-overrides.css");
  },
  knowledge: async () => {
    await import("@/styles/product-families/knowledge.css");
    await import("@/styles/product-families/knowledge-accessibility.css");
    await import("@/styles/product-families/unified-comments.css");
    await import("@/styles/product-families/unified-book-reviews.css");
    await import("@/styles/product-families/book-reader-annotations.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return import("@/styles/product-families/dark-legacy-overrides.css");
  },
  identity: async () => {
    await import("@/styles/product-families/identity.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    await import("@/styles/product-families/dark-legacy-overrides.css");
    return import("@/styles/product-families/identity-accessibility.css");
  },
  creation: async () => {
    await import("@/styles/product-families/creation.css");
    await import("@/styles/creator-workspace.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return import("@/styles/product-families/dark-legacy-overrides.css");
  },
  operations: async () => {
    await import("@/styles/product-families/operations.css");
    await import("@/styles/admin-workspace.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return import("@/styles/product-families/dark-legacy-overrides.css");
  },
  "account-policy": async () => {
    await import("@/styles/product-families/account-policy.css");
    await import("@/styles/product-families/dark-legacy-tokens.css");
    return import("@/styles/product-families/dark-legacy-overrides.css");
  },
};

const loaded = new Map<string, Promise<unknown>>();
export function loadFamilyStyles(family: string) {
  const loader = loaders[family];
  if (!loader) return Promise.resolve();
  const existing = loaded.get(family);
  if (existing) return existing;
  const request = loader();
  loaded.set(family, request);
  return request;
}
