# Production Incident Import Report

- Mode: DRY RUN
- Workbook: C:\Users\in-its-ga1\Downloads\Incidents_ImportIntoDB.xlsx
- Workbook SHA-256: 090538a9290e209948b0d3531a41c1bf706a22744b7cf0dc27a2df1b9d7f53b5
- Source rows: 204
- Existing incidents before import: 3
- Valid rows: 204
- Duplicate rows: 0
- Failed rows: 0
- Imported rows: 0
- Database count after import: not executed
- Transaction committed: false

## Validation

- Workbook has exactly 204 source rows: PASS — 204
- All required headers are present: PASS
- No source/database duplicate identifiers: PASS — 0
- All mandatory values and mappings are valid: PASS — 0
- All source timestamps remain IST wall-clock values: PASS — No UTC conversion is performed during import

## Approved mappings

- Incident references: sequential values beginning after the current highest `INC-nnn` reference.
- `created_by`: user ID 2 (Babai Chatterjee).
- `Escalated to Tier 3 QA`: database status `escalated_to_rd`.
- Approved customer/user aliases are used for foreign-key IDs; original workbook text is preserved.

## Rollback

No database writes occurred; no rollback is required.