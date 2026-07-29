# Incidents Table Schema Audit

Audit date: 2026-07-27  
Scope: first-party backend, frontend, SQL migrations, import/validation scripts, reports, Excel/PDF exports, dashboard, Customer 360, and the configured live MySQL schema/data. No schema or application changes were made.

## Executive summary

The live `incidents` schema matches the supplied DDL, but the checked-in baseline `backend/sql/schema.sql` does not. It still describes an older, incompatible incidents table and related tables. This is the first production risk to address because a new environment built from that file will not match the controller.

No column is safe to drop immediately. Several are clearly import-only or derived, but the controller uses `SELECT i.*`, maps compatibility fallbacks, and some reports still consume those aliases. Removal must follow a dual-read/dual-write deprecation.

The principal redundancy groups are:

- `customer` / `customer_id`
- `area` / `area_id`
- `legacy_case_number` / `sf_case_no`
- `start_dt` / `date_time_opened`
- `end_dt` / `date_time_closed` / `closed_date`
- `downtime_hours` / `downtime_minutes` / `downtime_mins` / `downtime_str`
- `mttd_minutes` / `mttd_str`
- `status` / `internal_status`
- `project` / `project_area` for the legacy importer

Canonical production values should be IDs for master data, typed UTC instants for timestamps, and integer minutes for duration metrics. Display strings should be formatted at the API/UI boundary rather than persisted.

Two current write-path defects make normalization urgent:

1. The detail/close UI sends `downtime_h` and `downtime_m`, while `downtime_mins` and `downtime_str` are independently writable and are not recomputed by the controller. This can make dashboards and exports disagree.
2. The UI sends `mttr_h` and `mttr_m`, but the controller only persists `mttrStr`; therefore the normal detail-save flow does not persist MTTR.

## Evidence and live profile

Primary code paths:

- CRUD, mapping, filtering, and dashboard SQL: `backend/controllers/incidentController.js`
- Master-data deletion safeguards: `backend/controllers/masterDataController.js`
- Historical import: `backend/scripts/import_historical_cloud_incidents.js`
- Legacy normalization migration: `backend/sql/002_legacy_incident_master_data_migration.sql`
- Timezone/MTTD migration: `backend/sql/003_persist_incident_timezone_mttd.sql`
- Dashboard, Customer 360, reports, PDF, bulk Excel, and edit flows: `js/app.js`
- Single-incident Excel: `js/incidentReportExcel.js`
- Historian reporting split: `js/reportingMetrics.js`

The configured live database contained 204 incidents:

- Every row had `incident_ref`, both customer forms, both area forms, both start forms, project/project_area, both case-number forms, numeric downtime fields, MTTD minutes, legacy provenance fields, and timestamps.
- 203 had end/closed values; the one open incident was the exception.
- Zero customer/area FK or snapshot-name mismatches.
- Zero start/end/closed-date mismatches.
- Zero `downtime_mins != downtime_hours * 60 + downtime_minutes` mismatches.
- Zero `legacy_case_number != sf_case_no` mismatches where both were populated.
- All 204 rows used timezone `IST`.
- `components`, `applications`, `sla_hours`, `rca`, `resolved_by`, and `mttr_str` were empty in all current rows, although application features actively read/write several of them.
- `rd_tickets` was populated in 2 rows; `downtime_str` in 77; `mttd_str` in 158.

This is a point-in-time consistency result, not a database guarantee.

## Field-by-field usage matrix

Legend:

- **R** read/mapped
- **W** created/updated/imported
- **F** filtered/searched/grouped
- **C** calculated
- **X** displayed/reported/exported
- **M** migration/import-only

| Column | Usage | Classification | Evidence/consumer | Recommendation | Risk |
|---|---|---|---|---|---|
| `id` | R/F | Active required | Internal lookup, activity-log FK, deletes | Keep numeric PK; consider `BIGINT UNSIGNED` only if scale requires it | Low |
| `incident_ref` | R/W/F/X | Active required | Public ID, API routing/search, UI/report/export filename, unique index | Keep immutable unique business identifier | Low |
| `legacy_case_number` | R/W/F/X/M | Legacy compatibility, duplicate | Search, API fallback, import dedupe; equals `sf_case_no` in live data | Move to external-reference/legacy table after consumers use `sf_case_no` | High |
| `title` | R/W/F/X | Active required | Lists, search, Customer 360, reports/exports | Keep; current `VARCHAR(255)` is reasonable | Low |
| `description` | R/W/F/X | Active required | Detail, search, report/export | Keep `TEXT` | Low |
| `severity` | R/W/F/C/X | Active required | Filters, stats, SLA fallback, reports | Keep constrained; remove legacy `low` enum only after data/API verification | Medium |
| `status` | R/W/F/C/X | Active required | Workflow, close guard, stats, dashboards | Keep canonical workflow status; prefer lookup/check over MySQL ENUM if values evolve often | Medium |
| `assigned_to` | R/W/F/X | Active required | User FK, assignee filter/display | Keep FK; assignment history should be separate if audit history is required | Low |
| `case_owner` | R/W/X/M | Rare/legacy snapshot, partly duplicate | Import owner preservation and fallback when no user maps | Keep during migration; later rename/move to source-owner snapshot metadata | Medium |
| `created_by` | R/W | Active required | Creator FK and audit join | Keep `NOT NULL`; define explicit delete policy | Low |
| `customer` | R/W/F/C/X/M | Active compatibility, duplicate | UI/reporting and fallback SQL; snapshot of customer name | Make `customer_id` source of truth; retire text only after all reads join master | High |
| `customer_id` | R/W/F/C | Active canonical | FK, master-data protection, reporting index | Keep; make `NOT NULL` after validation | Medium |
| `project` | R/W/C/X | Active required | Historian business rule, UI, reports | Keep now; normalize to `project_id` if projects are controlled master data | High |
| `project_area` | R/W/M | Legacy-only/rare | API maps it; importer writes same source as project; no current UI/report consumer | Deprecate after confirming external API clients; likely archive/remove | Medium |
| `area` | R/W/F/C/X/M | Active compatibility, duplicate | UI/reporting and dashboard fallback | Make `area_id` canonical; retire snapshot text after all joins are deployed | High |
| `area_id` | R/W/F/C | Active canonical | FK, stats, master-data guard, reporting index | Keep; make required if every incident must have an area | Medium |
| `product_line` | R/W/X | Active required | Form, detail, report/Excel | Keep; normalize only if centrally managed | Low |
| `components` | R/W/X | Active but currently empty | Incident detail and single/bulk exports | Keep; use junction table if components become searchable master data | Medium |
| `applications` | R/W/X | Active but currently empty | Incident detail and single/bulk exports | Keep; use junction table if applications become searchable master data | Medium |
| `sla_hours` | R/W/C/X | Active but currently empty | Per-incident SLA override; UI falls back by severity | Replace `FLOAT` with integer `sla_minutes` or SLA policy FK | Medium |
| `tags` | R/W/F/X | Active required | UI tag editing/filtering and reports | JSON is acceptable at current scale; normalize if server-side tag filtering/analytics is required | Medium |
| `start_dt` | R/W/C/X/M | Active compatibility, duplicate string | API fallback and UI alias `startDT` | Canonicalize on typed opened timestamp; remove after dual-read period | High |
| `date_time_opened` | R/W/F/C/X | Active canonical | Reports, SLA/MTTD/MTTR calculations, indexed date | Keep, but store an unambiguous UTC instant | High |
| `end_dt` | R/W/C/X/M | Active compatibility, duplicate string | API fallback and UI alias `endDT` | Canonicalize on typed closed timestamp; remove after dual-read period | High |
| `date_time_closed` | R/W/C/X | Active canonical | Downtime/MTTR/reporting, close flow | Keep, but store an unambiguous UTC instant | High |
| `closed_date` | R/W/F/X/M | Derived reporting date | Reporting index and export fallback | Prefer generated `DATE(date_time_closed)` or query expression; do not independently write | Medium |
| `timezone` | R/W/X | Active required but weakly modeled | UI input/display and reports | Use IANA zone (`VARCHAR(64)`) plus UTC instants; abbreviations such as IST are ambiguous | High |
| `downtime_hours` | R/W/C/X/M | Active duplicate | Primary dashboard/Customer 360/UI calculations | Deprecate after consumers use canonical total minutes | High |
| `downtime_minutes` | R/W/C/X/M | Active duplicate | Primary dashboard/Customer 360/UI calculations | Deprecate with hours; current name also ambiguously means remainder minutes | High |
| `downtime_mins` | R/W/C/X/M | Preferred canonical candidate | Import, API, single-incident Excel | Rename eventually to `downtime_minutes_total`; enforce nonnegative check | High |
| `downtime_str` | R/W/X/M | Derived/partially populated | API/report display fallback | Stop persisting; format from total minutes | Medium |
| `rca` | R/W/X | Active but currently empty | Detail and incident reports/exports | Keep `TEXT` | Low |
| `resolution` | R/W/X | Active required | Detail/reports; populated on all live rows | Keep `TEXT` | Low |
| `resolved_by` | R/W/X | Active but currently empty | Detail/reports/exports | Prefer `resolved_by_user_id` plus optional immutable display snapshot | Medium |
| `sf_case_no` | R/W/X/M | Active external identifier | Forms, incident report, Excel/PDF, import dedupe | Keep as Salesforce source of truth; add index/uniqueness policy | Medium |
| `incident_report_status` | R/W/C/X | Active workflow field | Mandatory Yes/No validation before close | Replace free text with constrained semantic status/boolean after clarifying meaning | Medium |
| `mttd_str` | R/W/X/M | Derived | Legacy import and display fallback | Stop persisting; format from `mttd_minutes` | Medium |
| `mttd_minutes` | R/W/C/X | Active canonical | Persisted create/edit value, dashboard/report calculations | Keep integer total minutes with nonnegative constraint | Low |
| `legacy_month` | W/M | Import-only, unused after import | Historical importer/raw provenance only | Derive from opened date; move to legacy metadata/archive | Low after archive |
| `account_name` | R/W/X/M | Rare legacy/report value | Import and single-incident Excel notification fallback | Normalize to customer/account model or archive after report mapping changes | Medium |
| `internal_status` | R/W/M | Legacy-only duplicate | Import preserves source status; API maps but UI does not use it | Move to legacy metadata; canonical `status` remains | Low after archive |
| `rd_tickets` | R/W/X | Active, sparse | Form, detail, reports, Excel/PDF | Keep now; normalize to incident-ticket rows if multiple tickets need querying | Medium |
| `legacy_source` | W/M | Import-only provenance | Historical import only | Preserve in archive/audit metadata, not core incident row | Low after archive |
| `legacy_raw` | W/M | Import-only provenance/rollback | Full source row, never read by runtime | Move to immutable import archive with retention policy | Medium |
| `mttr_str` | R/W/X | Intended active, currently broken/empty | API/report display; UI sends fields controller ignores | Add canonical `mttr_minutes`; repair write mapping; then remove string | High |
| `created_at` | R/W/F | Active required metadata | Sort order, fallback opened time, index | Keep `NOT NULL`; preferably UTC with fractional precision | Low |
| `updated_at` | R | Active audit metadata | Returned by API; automatic DB update | Keep `NOT NULL`; UTC semantics | Low |

## Unused and rarely used columns

### Completely unused by runtime application

- `legacy_month`: import write only; never read, filtered, displayed, or exported by runtime.
- `legacy_source`: import write only; never read by runtime.
- `legacy_raw`: import write only; never read by runtime.

These are not immediate drop candidates because `legacy_raw` and `legacy_source` provide import lineage and rollback evidence. Move them to an archive table before removal.

### Legacy-only or migration-only

- `project_area`
- `internal_status`
- `legacy_case_number` (still used for search/fallback/dedup, so not removable yet)
- string date fields `start_dt`, `end_dt`

### Active but empty in the current 204-row dataset

- `components`
- `applications`
- `sla_hours`
- `rca`
- `resolved_by`
- `mttr_str`

Empty data does not mean unused. All except the defective MTTR persistence have active form/report paths and should remain until product requirements change.

### Rarely populated

- `rd_tickets`: 2/204, but actively edited and reported.
- `downtime_str`: 77/204, derived and unnecessary.
- `mttd_str`: 158/204, derived and unnecessary.

## Duplicate/redundant data and source-of-truth decisions

| Group | Current risk | Source of truth | Production approach |
|---|---|---|---|
| Customer name + ID | Both written together; queries use `OR`, so drift can alter filters | `customer_id` | Join `customers`; optional immutable name snapshot only in audit/report snapshot tables |
| Area name + ID | Both written together; dashboard uses fallback | `area_id` | Join `area`; remove text fallback after completeness validation |
| Salesforce + legacy case | Import and create duplicate the same value; both used in fallback | `sf_case_no` for Salesforce; external-reference table for other legacy IDs | Add `incident_external_reference(incident_id, system, reference, source)` with unique `(system, reference)` |
| Open timestamps | String and DATETIME independently writable | UTC typed opened timestamp | Dual-write temporarily; typed-value comparison monitor; remove string |
| Close timestamps/date | Three independently writable representations | UTC typed closed timestamp | Generated/indexed local/reporting date only where required |
| Downtime | Four writable representations and different consumers | Integer total minutes | One canonical field; API derives hours/remainder/string |
| MTTD | Numeric and display string | `mttd_minutes` | Format in API/UI |
| MTTR | Only display string in DB; UI write is not persisted | New `mttr_minutes` | Persist numeric value or compute from timestamps according to agreed definition |
| Status | Canonical enum plus source text | `status` | Move original source value to legacy metadata |
| Project/project area | Historical import writes one source into both | `project` today; future `project_id` | Define project vs area semantics; do not keep synonyms |
| Assigned user/owner text | FK plus source/display snapshot | `assigned_to` for ownership | Preserve source owner only as import metadata or assignment-history snapshot |

## Date/time assessment

The current model stores local wall-clock values in `DATETIME` and a short timezone label. It does not guarantee a globally unambiguous instant:

- `VARCHAR(10)` cannot hold standard IANA identifiers such as `America/New_York`.
- Abbreviations can be ambiguous and do not encode daylight-saving transitions.
- `start_dt`/`end_dt` are strings and can contain inconsistent formats.
- All live data is IST and internally consistent, so migration is straightforward today, but future multi-zone data will increase risk.

Recommended model:

- `opened_at_utc DATETIME(6) NOT NULL`
- `closed_at_utc DATETIME(6) NULL`
- `source_timezone VARCHAR(64) NOT NULL` containing an IANA zone
- Convert at API boundaries; never reinterpret stored local strings in the browser.
- If reporting requires the source-local calendar date, derive it using the stored zone or materialize it in a reporting fact table.

Do not convert existing `DATETIME` values to UTC without applying their row-level timezone; doing so would shift historical events incorrectly.

## Schema and integrity improvements

### High priority

1. Replace the stale baseline `backend/sql/schema.sql` with a schema generated from versioned migrations or a verified current baseline. Its current PK, columns, enums, user columns, comments, tags, and FK types are incompatible with production.
2. Centralize incident write normalization in one service/repository function. Create, edit, close, and import currently write different subsets.
3. Make total numeric minutes canonical for downtime, MTTD, and MTTR.
4. Add database checks where supported:
   - duration minutes `>= 0`
   - `date_time_closed >= date_time_opened`
   - remainder-minute fields, while retained, between 0 and 59
   - constrained incident report status
5. Repair MTTR persistence before migrating it.

### Normalization

- Require `customer_id`; derive customer name by join.
- Require/retain `area_id` according to business optionality.
- Add a `projects` table if projects are governed values. Add a reporting classification such as `responsibility_category` or `is_customer_infrastructure` to project metadata, so Historian separation is not hard-coded to a name.
- Use junction tables for applications, components, tags, and R&D tickets if they need filtering, ownership, or referential integrity.
- Move import provenance into `incident_legacy_metadata` or an immutable `import_records` table.
- Use an external-reference table for Salesforce and other case systems.

### Datatypes and constraints

- Change `sla_hours FLOAT` to `sla_minutes SMALLINT UNSIGNED` or an SLA policy FK. Floating-point hours are unnecessary and can compare imprecisely.
- Add `mttr_minutes INT UNSIGNED NULL`.
- Use `INT UNSIGNED` for duration columns and identifiers where compatible with referenced tables.
- Make `severity` and `status` `NOT NULL`. If workflow values change regularly, prefer lookup tables or `VARCHAR` plus checks over MySQL ENUM.
- Remove `low` from the severity domain only after proving no rows/API clients use it.
- Make `created_at`/`updated_at` non-null and standardize UTC handling.
- Use `VARCHAR(64)` for IANA timezone names.

### Index review

Existing indexes are valid but not all match real query shapes:

- Keep PK, unique `incident_ref`, user FKs, customer/area FKs, and created timestamp.
- `idx_incidents_legacy_case_number` helps exact import checks, but the runtime search uses a leading-wildcard `LIKE`, which cannot effectively use the B-tree.
- `sf_case_no` lacks an index even though import dedupe checks it. Add a nonunique or unique index after duplicate/business validation.
- `idx_incidents_case_owner` and `idx_incidents_product_line` have no current server filter query; validate with production query statistics before retaining.
- `(date_time_opened, date_time_closed)` does not efficiently support closed-date-only queries because of left-prefix rules.
- `(customer_id, area_id, severity, status, closed_date)` is useful only when its leading columns are constrained; it does not replace indexes for global status/date analytics.

Candidate indexes must be validated with `EXPLAIN ANALYZE` and real workload:

- `(customer_id, date_time_opened)`
- `(status, date_time_opened)`
- `(date_time_closed)`
- `(project, date_time_opened)` during the current string-based Historian model
- `sf_case_no`

Avoid adding all candidates blindly; each index increases write and storage cost.

## Production-grade target design

Core `incidents` should contain only canonical operational facts:

- numeric PK and immutable `incident_ref`
- title/description
- severity/status
- `customer_id`, optional `project_id`, optional `area_id`
- assignee/creator/resolver IDs
- UTC opened/closed timestamps and IANA source timezone
- canonical downtime/MTTD/MTTR minutes
- SLA policy or integer SLA minutes
- RCA/resolution/report status
- creation/update timestamps

Related tables should hold:

- external references (Salesforce and legacy case IDs)
- import provenance/raw source
- assignment history
- incident tags
- incident applications/components
- R&D ticket links
- optional report snapshots if exported reports must retain historical names after master-data changes

## Risk assessment

| Proposed change | Risk | Reason/mitigation |
|---|---|---|
| Fix baseline schema/migrations | High | New installs are currently incompatible; verify on a disposable database and compare schema fingerprints |
| Canonical downtime minutes | High | Dashboard/Customer 360 use hours/remainder while Excel may prefer total; dual-write and reconciliation required |
| Typed UTC timestamps | High | Incorrect timezone conversion would shift historical data |
| Remove customer/area text | High | UI/API/statistics currently use fallbacks and name filters |
| Normalize project/Historian classification | High | Directly affects responsibility reporting and acceptance rules |
| Add MTTR minutes/fix persistence | High | Current data is empty and UI writes are lost; definition must be agreed before backfill |
| Consolidate case numbers | Medium/High | Search, imports, reports, and external integrations use both aliases |
| Remove string date/duration fields | Medium | Safe only after telemetry proves no legacy clients read them |
| Archive legacy metadata | Medium | Raw import lineage and rollback capability must be retained |
| Add constraints | Medium | Existing and concurrent writes must be cleaned/updated first |
| Index changes | Medium | Requires workload evidence and online DDL planning |
| Keep active content fields | Low | No behavior change |

## Safe migration and rollback plan

### Phase 0 — freeze definitions and baseline

1. Define the exact semantics of downtime, MTTD, MTTR, report status, project, and project area.
2. Inventory external API consumers and direct SQL/report users not present in this repository.
3. Back up the database and record row counts, checksums, schema, indexes, constraints, and representative report outputs.
4. Add automated contract tests for create/edit/close/import/API mapping, dashboard, Customer 360, PDF, and both Excel exports.
5. Replace the stale baseline with reproducible, ordered migrations; test empty-database provisioning.

Rollback: no data changes; revert code/baseline artifacts.

### Phase 1 — add canonical fields without removing anything

1. Add `opened_at_utc`, `closed_at_utc`, `source_timezone`, `sla_minutes`, and `mttr_minutes` as nullable.
2. If adopted, add project/external-reference/legacy-metadata tables.
3. Add checks as nonblocking validation queries first, then constraints only after cleanup.
4. Add required indexes after `EXPLAIN ANALYZE`.

Rollback: drop only newly added, still-unconsumed columns/tables; preserve backups.

### Phase 2 — backfill and reconcile

1. Backfill UTC timestamps using each row's stored timezone.
2. Backfill canonical downtime from `downtime_mins`, verifying it equals hours/remainder.
3. Backfill MTTD from `mttd_minutes`.
4. Do not derive MTTR until its business definition is approved; where approved, derive from authoritative event timestamps.
5. Populate external references and legacy metadata.
6. Reconcile every row with exception tables; require zero unexplained differences.

Rollback: retain old columns as authoritative; truncate/rebuild new structures from the backup/backfill script.

### Phase 3 — dual-write and dual-read

1. Update one backend normalization service to write canonical and compatibility columns transactionally.
2. Make API responses continue exposing old aliases, but derive them from canonical values.
3. Read canonical first and log every fallback to a legacy column.
4. Run in production for at least one full reporting cycle.

Rollback: feature flag reads back to legacy columns; dual-written data remains available.

### Phase 4 — switch consumers

1. Move dashboard, Customer 360, SLA, MTTD, MTTR, downtime, PDF, and Excel code to canonical API fields.
2. Move customer/area reporting to master joins.
3. Move Historian logic to configured project classification if introduced.
4. Validate old/new outputs side by side for historical and current incidents.

Rollback: switch consumer feature flags to compatibility aliases.

### Phase 5 — constrain and deprecate

1. Make canonical required fields `NOT NULL` where appropriate.
2. Enable checks/FKs and monitor errors.
3. Stop writing derived/legacy columns, but keep reading compatibility aliases for a defined deprecation window.
4. Publish API deprecation notices and monitor access.

Rollback: resume dual-write; constraints can be relaxed through a forward migration.

### Phase 6 — archive and remove

1. Copy import-only fields to the archive table and verify counts/checksums.
2. Take a final backup.
3. Drop fields in small migrations, one redundancy group at a time.
4. Remove unused indexes only after query-plan review.

Rollback: restore the affected columns from the archive/backup with a forward restoration migration; never rely on an in-place destructive rollback.

## Validation gates for no regression

No removal should proceed unless all gates pass:

- Every supplied column has an identified owner and consumer decision.
- Zero unexplained backfill/reconciliation mismatches.
- Create, edit, close, reopen, assignment, deletion, and import tests pass.
- Dashboard totals, Historian split, Customer 360 counts/downtime, SLA, MTTD, and MTTR match baseline fixtures.
- Incident PDF, bulk Excel, and single-incident Excel match field-by-field.
- API old/new contract comparison passes for every incident.
- Master-data FK/orphan checks return zero.
- Performance tests show no regression for incident list filters and reporting periods.
- A backup restore and forward rollback migration have been rehearsed.

Because this audit did not implement the migration, it cannot truthfully certify that future changes will have no impact. It establishes the concrete gates required to make that certification before deployment.
