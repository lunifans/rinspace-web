# Version support and security fixes

Rinspace Web supports the two newest minor release lines for at least 90 days after a successor. Only the latest patch in each supported minor receives fixes. Release notes identify contract compatibility, migration requirements, supported backend versions, and rollback limitations.

Normal fixes land in this public repository first, ship as an immutable verified release, and are then selected by the official private deployment lock. Official deployments never consume `main`, `latest`, or a production-host rebuild.

Security reports use the private channel documented by the approved `SECURITY.md` once the legal/community release gate is complete. Embargoed work uses a restricted security-advisory fork; the fixed corresponding source, release checksums, SBOM, and attestations are published no later than deployment. Do not disclose an unpatched vulnerability in a public issue.

An emergency official-only browser patch is limited to 168 hours, must already have a public reconciliation PR, and is blocked from the next normal release until reconciled. Its owner, reason, base lock, patch digest, expiry, and eventual public commit are auditable in the private operator registry. This exception cannot carry credentials, weaken authorization, or bypass release/legal gates.

Breaking API versions run side by side for at least 90 days and two public minor releases. After that window an unsupported client receives HTTP 426 with `contract.upgrade_required`, a minimum version, and an actionable public release/source link.
