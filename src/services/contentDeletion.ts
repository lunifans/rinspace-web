export function contentDeletionCommand(slug: string, idempotencyKey: string) {
  return {
    confirmation: `DELETE ${slug.trim()}`,
    idempotencyKey,
  };
}
