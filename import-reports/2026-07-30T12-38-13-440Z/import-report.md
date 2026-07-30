# Production Incident Import Report

- Mode: EXECUTE
- Workbook: C:\Users\in-its-ga1\Downloads\Incidents_ImportIntoDB.xlsx
- Workbook SHA-256: 090538a9290e209948b0d3531a41c1bf706a22744b7cf0dc27a2df1b9d7f53b5
- Source rows: 204
- Existing incidents before import: 3
- Valid rows: 204
- Duplicate rows: 0
- Failed rows: 0
- Imported rows: 204
- Database count after import: 207
- Transaction committed: true

## Validation

- Workbook has exactly 204 source rows: PASS — 204
- All required headers are present: PASS
- No source/database duplicate identifiers: PASS — 0
- All mandatory values and mappings are valid: PASS — 0
- All source timestamps remain IST wall-clock values: PASS — No UTC conversion is performed during import
- Source count equals imported count: PASS — 204 = 204
- Database count increased only by import count: PASS — 3 + 204 = 207
- Exact pre-commit field reconciliation: PASS — 0 mismatches

## Approved mappings

- Incident references: sequential values beginning after the current highest `INC-nnn` reference.
- `created_by`: user ID 2 (Babai Chatterjee).
- `Escalated to Tier 3 QA`: database status `escalated_to_rd`.
- Approved customer/user aliases are used for foreign-key IDs; original workbook text is preserved.

## Rollback

Run `rollback.sql` against the same database. It deletes only this import batch by generated incident reference.

## Independent post-import validation

- Database total: 207
- Imported batch: 204 (`INC-004` through `INC-207`)
- Duplicate SF case groups: 0
- Orphan customer, area, and assignee references: 0
- Timestamp mismatches: 0
- Source rows missing a close timestamp: 1; database rows missing a close timestamp: 1
- UTC conversions performed: 0
- Pre-commit field mismatches: 0
- Application regression tests: 89 passed, 0 failed
