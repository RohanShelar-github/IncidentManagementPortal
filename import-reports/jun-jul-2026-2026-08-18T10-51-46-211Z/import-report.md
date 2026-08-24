# June & July 2026 Production Incident Import

- Mode: EXECUTE
- Source: C:\Users\in-its-ga1\Documents\Cloud Incidents from Jun'26 to Jul'26.xlsx
- Source SHA-256: e1b96eac153502b4612d23e4e5de6f2048f9d33f2626ba55ac75bf8cc5683d02
- Source records: 70
- Imported records: 70
- Duplicate records: 0
- Failed records: 0
- Transaction committed: true

## Validation

- Required source headers are present: PASS — 0 missing
- Source contains only June and July 2026 rows: PASS — 70 rows
- No source or database identifier duplicates: PASS — 0 duplicates
- All values and foreign-key mappings are valid: PASS — 0 failures
- All timestamps retain their IST wall-clock value: PASS — No timezone conversion or UTC population is performed
- Source record count equals imported record count: PASS — 70 = 70
- Exact field reconciliation passed: PASS — 0 mismatch(es)
- January–May and August production records are unchanged: PASS — hash comparison passed

## Integrity notes

- All source row values and original Excel date serials are retained in `legacy_raw`.
- `date_time_opened`, `date_time_closed`, and `closed_date` are written as the IST wall-clock values in the workbook; no UTC conversion fields are populated.
- The database enum stores severity/status in its required lowercase representation; the exact workbook spellings remain in `legacy_raw` and `internal_status`.
- No existing incident, customer, area, or user record is updated or deleted.

## Recovery

Use `rollback.sql` to delete only this import batch. The pre-import incident snapshot is in `backup/pre-import-incidents.json`.
