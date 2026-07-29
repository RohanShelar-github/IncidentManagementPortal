# Incident Normalization Impact Analysis

## Compatibility

Existing API fields and aliases remain present, including legacy local timestamps, timezone abbreviations, downtime hour/minute/string values, MTTD strings, and MTTR strings. New canonical fields are additive.

Dashboard, Customer 360, Historian separation, SLA, incident reporting, PDF, and Excel code continue consuming the same browser incident model. The browser now prefers canonical duration totals when supplied and regenerates the existing aliases.

## Business logic

Historian classification is unchanged: project name `Historian` remains the reporting discriminator. Total application downtime and NGC Application/Historian separation continue to use the existing reporting functions.

No workflow, status, severity, close-report requirement, customer, area, or project business rule was changed.

## Data

Migration 005:

- adds five canonical columns;
- archives five legacy/import fields without deleting their originals;
- backfills deterministic UTC values;
- reconciles duration representations;
- adds integrity checks and targeted indexes.

The migration produces validation result sets, and the reconciliation script fails with a nonzero exit code when any mismatch remains.

## Remaining controlled work

Dropping compatibility fields, making customer/area IDs non-null, project master-data normalization, and replacing legacy timezone selectors are deliberately deferred. Those changes require external-consumer telemetry and a completed compatibility window.


## Validation evidence

Validation completed against the configured development database on 2026-07-27:

- 204 incidents reconciled; all eight mismatch checks are zero.
- 204 legacy metadata rows archived; no archive row is missing.
- Customer and area foreign-key/snapshot checks have zero mismatches.
- Authenticated API lifecycle passed creation, assignment/update, closure, read, reopening, list, statistics, and cleanup.
- API lifecycle verified downtime, MTTD, MTTR, UTC timestamp, IANA timezone, and legacy alias persistence.
- Production baseline creation and migration-005 rollback passed in an isolated disposable database.
- All 15 automated regression tests pass, including Historian and incident Excel export coverage.
- JavaScript syntax validation and `git diff --check` pass.

The validation lifecycle incident was deleted after the test. The final incident count returned to 204.

An external database backup was not produced because `mysqldump` is not installed in this environment. A verified production backup remains a mandatory deployment prerequisite.
