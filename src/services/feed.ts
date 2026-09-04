// Compatibility surface for code that has not moved to a domain import yet.
// New business implementations belong in services/domains/* and all network
// traffic must use the runtime transports or an approved low-level adapter.
export * from './legacyFeed';
