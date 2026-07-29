# Incident Normalization Migration

This implementation is additive and backward compatible. It does not drop or rename an existing column.

## Delivered

- Corrected empty-database baseline: `backend/sql/schema.sql`
- Additive migration: `backend/sql/005_incident_canonical_normalization.sql`
- Logical rollback: `backend/sql/rollback/005_incident_canonical_normalization.rollback.sql`
- Reconciliation gate: `backend/scripts/reconcile-incident-normalization.js`
- Authenticated API lifecycle gate: `backend/scripts/validate-normalized-api.js`
- Disposable baseline/rollback gate: `backend/scripts/validate-normalization-rollback.js`
- Canonical duration/timezone service: `backend/services/incidentNormalization.js`
- API dual-read/dual-write and MTTR persistence repair
- Browser compatibility normalization for legacy and canonical API fields

## Canonical fields

- `customer_id` and `area_id` remain authoritative master references.
- `opened_at_utc` and `closed_at_utc` store UTC instants.
- `source_timezone` stores an IANA identifier.
- `downtime_mins` is the canonical downtime total.
- `mttd_minutes` is the canonical MTTD total.
- `mttr_minutes` is the canonical MTTR total.
- `sla_minutes` is the canonical SLA override.

Legacy fields remain populated and returned during the compatibility period.

## Deployment order

1. Take and restore-test a database backup.
2. Deploy application code with `CANONICAL_INCIDENT_FIELDS=false`.
3. Run:

   `node backend/scripts/run-sql-file.js backend/sql/005_incident_canonical_normalization.sql`

4. Run the reconciliation gate:

   `node backend/scripts/reconcile-incident-normalization.js --output backend/reports/incident-normalization-reconciliation.json`

5. Require every mismatch count to be zero.
6. Run automated tests and representative Dashboard, NGC Customer 360, Historian, PDF, bulk Excel, and incident Excel comparisons.
   Run the API and rollback gates in a controlled non-production environment:

   `node backend/scripts/validate-normalized-api.js`

   `node backend/scripts/validate-normalization-rollback.js`
7. Enable `CANONICAL_INCIDENT_FIELDS=true` and deploy the backend.
8. Monitor API errors, fallback usage, query latency, and reconciliation for one full reporting cycle.

The migration must precede enabling the flag because the enabled controller selects the new columns.

## Rollback

Preferred operational rollback:

1. Set `CANONICAL_INCIDENT_FIELDS=false` and redeploy the previous-compatible backend.
2. Leave additive columns and archive data in place. They do not affect the legacy application.
3. Restore from the verified backup if data corruption is suspected.

Only when removal of the additive structures is required, after the application flag is disabled, run:

`node backend/scripts/run-sql-file.js backend/sql/rollback/005_incident_canonical_normalization.rollback.sql`

The rollback script removes only migration-005 structures. It does not change any pre-existing field.

## Risk controls

- High: timestamp conversion. Known legacy abbreviations use deterministic offsets; unknown zones remain unresolved and fail reconciliation instead of being guessed.
- High: downtime. Every write transaction derives hours, remainder minutes, total minutes, and display text from one total.
- High: MTTR. The API now accepts numeric total or legacy hour/minute/string inputs and persists both canonical and compatibility forms.
- High: deployment ordering. The feature flag permits old-schema operation.
- Medium: archive completeness. Reconciliation compares every incident with legacy content to its archive row.
- Medium: indexes. Added indexes match current filter/report shapes; production latency and write cost must still be observed.

## Deprecation gate

No old field may be removed until all audit validation gates pass for a full reporting cycle. This phase intentionally performs no deprecation.
