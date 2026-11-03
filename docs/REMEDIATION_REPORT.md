# DataForge Studio remediation evidence

Date: 2026-10-30. Scope: the 12 findings in the supplied post-audit repair contract,
including mandatory L1. Original audit: `/tmp/dataforge-audit-qqi1h5ho/AUDIT.html`.
Evidence directory: `/tmp/dataforge-repair-ijhskt2_`.

**Finding status: 12/12 RESOLVED by passing regression tests and executable
behavior checks. Final test suites have zero failures. Overall release sign-off
is withheld because full comparison of original metadata contents cannot be
established from the initial physical-file-only baseline.** See Data preservation;
this limitation must not be represented as a verified preservation result.

## Findings and verification

IDs H1–L1 correspond in order to audit IDs DF-01–DF-12.
Backend test names below are in `backend/tests/test_remediation.py`; browser test
names are in `frontend/tests/remediation.spec.ts`. All RESOLVED statuses below
refer to the repaired source tested in a disposable production checkout.

| Finding | Confirmed root cause | Fix and source files | Passing regression and observed behavior | Status / limitation |
| --- | --- | --- | --- | --- |
| H1 / DF-01: non-finite SQL | SQLite/Python floats containing infinity entered JSON columns and HTTP responses without strict normalization. Legacy stored JSON could poison history/dashboard responses. | `backend/app/core/json_values.py`, `backend/app/db/session.py`, `backend/app/services/sql.py`, `backend/app/api/routes.py`: recursive explicit non-finite string markers at SQL, JSON persistence and API boundaries; normalize legacy records on read. | `test_h1_sql_nonfinite_is_explicit_and_all_read_endpoints_work` (positive and negative infinity), `test_h1_legacy_nan_and_infinity_history_is_readable_without_rewriting`: SQL succeeds; history/detail/dashboard return valid JSON; CSV exposes markers; finite values remain numeric; raw legacy row remains unchanged. | RESOLVED. Markers are strings, documented in API; no destructive data migration. |
| H2 / DF-02: CSV field loss | Pandas inferred an index when records had more fields than the header; short records were accepted as missing fields. | `backend/app/services/data.py`: strict CSV record-width validation before Pandas, physical-line errors, disabled index inference; retain file/row/column limits. | `test_h2_malformed_csv_width_is_rejected_without_orphans` (3 inputs), `test_h2_valid_quoted_csv_preview_and_sql_values_agree`: overlong/short/quoted-empty-short records rejected with HTTP 400; no upload orphan; BOM/CRLF/quoted comma/multiline/blank-line valid file has identical preview and SQL values. | RESOLVED. Previously accepted malformed datasets now fail clearly when read; original uploaded bytes are not rewritten. |
| H3 / DF-03: save races | Save completion unconditionally applied old notebook content or marked a newer pipeline draft SAVED. | `frontend/src/lib/save-revision.ts`, Python and pipeline pages: revision/scope/request tokens; SAVING/SAVED/UNSAVED/SAVE FAILED states; apply a server snapshot only to its matching revision; retain created pipeline ID for retry. | Two `H3 ... delayed saves preserve newer edits, failed saves retry` browser tests: pause real save response, edit name, release response; new draft survives and remains UNSAVED; retry persists it. Injected 503 retains draft and SAVE FAILED; retry reaches SAVED and backend value agrees. | RESOLVED. Single-editor revision handling; no multi-client conflict protocol added. |
| M1 / DF-04: ETL reorder | Index/operation React keys reused a local parameter editor for a different instance of the same operation. | Pipeline page: stable UUID per draft transformation; key by identity, preserve identity during moves/edits, regenerate on resource load; strip identities from API payload. | `M1: identical ETL operations keep their parameters on reorder and deletion`: open two select operations, move second up, check both visible values, remove it, verify remaining preview request fields and absence of editorId. Real backend preview succeeds. | RESOLVED. UI identity is editor-only. |
| M2 / DF-05: delete notice | A canceled task returned normally, triggering the task wrapper's generic success message. | Dataset page and `frontend/src/lib/hooks.ts`: explicit false suppresses success; actual DELETE response precedes success notification. | `M2: cancel deletion stays silent; confirmed deletion needs a real backend response`: dismiss causes zero DELETE requests, no toast, dataset remains; accept receives real HTTP 204 then success toast. | RESOLVED. |
| M3 / DF-06: sidebar | The component's `.collapse` class collided with Tailwind's visibility utility. | `frontend/src/components/shell.tsx`, `frontend/src/app/globals.css`: `.sidebar-toggle`, responsive initial state and manual expansion, matching aria-expanded; mobile overlay layout. | `M3: sidebar toggle is visible and works at desktop and mobile widths`: real Chrome desktop/mobile visibility, expanded/collapsed widths, aria state, navigation and horizontal overflow checks. | RESOLVED. Chrome tested; no claim for every browser or viewport. |
| M4 / DF-07: Excel headers | Dataframe columns could be numbers while metadata/ETL selectors were strings; conversion collisions could discard values in dictionaries. | Data service and dataset routes: canonical string identifiers on load; deterministic suffixes avoiding existing names; repair legacy column display on read without updating stored rows. | `test_m4_excel_numeric_and_colliding_headers_keep_all_values_and_select`: mixed `1`, `"1"`, `"1_2"`, `"note"` headers retain all four values; deterministic names `1`, `1_3`, `1_2`, `note`; repeated select preview agrees with SQL import. | RESOLVED. Original workbook bytes remain intact. |
| M5 / DF-08: UPDATE RETURNING | Result cap left an active write cursor with unread rows when SQLite tried to commit. | SQL service: authorizer observes permitted writes; drain mutation results in bounded batches while retaining only capped output; close cursor before commit; preserve read-query cap and progress deadline. | `test_m5_large_returning_commits_all_changes_with_capped_output`: 700 updates committed, 700 affected, 500 displayed/truncated, values checked with a separate SQLite connection. Recursive read in write mode still stops at cap; read-only DELETE and ATTACH remain rejected. | RESOLVED. Existing execution deadline still bounds large mutations. |
| M6 / DF-09: stale history | Generic loader retained previous data across errors/path changes; older asynchronous refreshes could overwrite newer results. | Hooks and history page: path-keyed state, request sequence invalidation, clear incompatible data, explicit error/empty states and retry. | `M6: filter failures clear results, retry works, and stale refresh responses cannot win`: hold old Refresh, select SQL, release old request, only SQL remains; injected filter 503 clears rows and displays actual error; real retry returns Python rows; loading indicator checked. | RESOLVED. Shared loader also used by the other modules; existing workflow passes. |
| M7 / DF-10: dirty import | Import replaced editor state without consulting dirty state. | Python page: confirm before import when dirty; canceled file input resets without replacing draft or posting an import. | `M7: import cancellation preserves unsaved content; confirmed import replaces it`: canceled import preserves draft and resource count; explicit acceptance imports and opens the real notebook. | RESOLVED. |
| M8 / DF-11: execution dialog | A visually modal div lacked focus containment, initial focus, dismissal behavior and restoration. | `frontend/src/components/ui.tsx`, CSS: native modal dialog, labeled heading, focused Close, Escape/backdrop/Close handling and opener restoration. | `M8: details dialog traps focus, supports Escape/Close and restores its opener`: keyboard focus enters Close, repeated Tab/Shift+Tab stays in modal, Escape dismisses and restores focus; reopening and Close also restore focus. | RESOLVED. Native dialog tested in Chrome. |
| L1 / DF-12: failed ETL CSV | Final output was written before preview/destination/metadata success, without ownership-aware compensation. | Pipeline route: validate preview first; exclusive temporary file; no-overwrite atomic hard link; retain staging inode through commit; caught failures remove only owned staging/publication links and clear failed output reference. | `test_l1_failed_etl_leaves_no_owned_csv_and_preserves_other_outputs` (5 cases): duplicate-column preview, destination import, partial CSV write, publication and metadata-commit faults leave no owned CSV or temporary file. Previous successful output and user-created file bytes survive. `test_l1_publication_never_overwrites_an_existing_user_file`: deliberate final-name collision preserved, failed execution has no download reference. | RESOLVED, including Low severity. Abrupt OS termination and disk cleanup failure are not distributed transactions; see limits below. |

## Executable evidence

The original source was frozen before edits in `before/`; repaired source was
copied to `after2/`. Dependency environments were reused, but storage and build
directories were isolated. No dependency versions, port configuration or external
services were changed. The existing `.git` was not a usable Git repository, so
`before.json` (228 file SHA-256 entries) and the source copy were used for the
change inventory. No Git history was created or pushed.

Original-failure checks (expected failures, **not** the final suite):

- Backend regression file against frozen original modules: **13 failed, 2 passed**.
  `backend-before-final.log` records the exact failures. The valid CSV control and
  partial-write cleanup control passed originally; the L1 duplicate-column and
  destination-error cases demonstrate the original orphan defect.
- Chrome regression tests against the original production build: **9 failed**,
  including both save races and M1's actual post-reorder value mismatch. The ninth
  is the ordered workflow's missing filter-empty message. See `before-browser.log`.
- An earlier M1 test setup omitted acceptance of the existing discard confirmation;
  this was corrected and the original build was rerun. The final original failure
  is after a successful open and reorder, not at that confirmation.

Final repaired-source checks:

| Check | Actual result | Evidence |
| --- | --- | --- |
| `bash verify.sh` in disposable `after2/` | Exit 0; every check PASS | `final-verify.log` |
| Backend `pytest backend/tests -q` | **26 passed in 4.74s**: 11 existing + 15 new parametrized instances | Same log |
| Local Monaco/sample asset preparation | PASS | Same log |
| Frontend ESLint | PASS, zero errors | Same log |
| `next typegen && tsc --noEmit` (`strict: true`) | PASS | Same log |
| `next build --webpack` | PASS, all application routes generated | Same log and `after2-build.log` |
| Existing browser workflow + focused regressions, real Chrome | **10 passed in 14.1s**, zero retries/failures | `after2-browser.log` |
| Backend process restart on same isolated home | Seven endpoint snapshots identical before/after | `after2-summary.json`, `after2-restart-snapshot.json` |
| Shell syntax of updated `scripts/e2e.sh` | `bash -n scripts/e2e.sh` PASS | Executed locally |
| Existing services, read-only health checks | HTTP 200 on backend 8001 and frontend 3001 | Executed after final verification |

Browser harness command: `python3 /tmp/dataforge-repair-ijhskt2_/browser_harness.py after2`
(the mode directory was created once). It builds a production copy, starts real
FastAPI and Next servers on disposable free ports and stops only those owned
process groups. The test fixture serves that copy under browser origin
`http://localhost:3001` through Playwright routing; API calls, including actual
multipart file bytes, go directly to the isolated backend. Existing app CORS and
Origin policies remain active. Chrome's local-network permission is granted to
that test origin to support this transport. Only intentional save/filter fault
responses are stubbed; successful operations use real services and persistence.

The two end-to-end tests exercise all seven modules: Dashboard, Python, Datasets,
SQL Lab, ETL, History and Settings. One specifically follows upload → dataset-based
Python → SQL → ETL → History → Dashboard, checks computed values and execution
counts, and verifies the empty filter state. The existing retail workflow still
checks 245 input rows → 233 cleaned rows, separate rerun destinations, downloads
and refresh persistence. Backend restart comparison covers dashboard, notebooks,
datasets, saved SQL queries, pipelines, history and workspace schema. Existing
backend tests also check restart reconciliation and saved code/data persistence.
These checks cover core workflows, not an exhaustive proof of every possible
interaction in all seven modules.

For future fixed-port execution, `./scripts/e2e.sh` creates an isolated
`dataforge-e2e-*` home and refuses conflicting port startup. Fixtures refuse to
mutate an API whose settings do not identify isolated browser-test storage. Its
restart check now snapshots the whole suite's actual resources and CSV hashes
rather than assuming one notebook and exactly four historical events. The updated
fixed-port wrapper itself was syntax checked; it was **not** run end to end while
the user's services occupied those ports. The dynamic harness above was actually
run, including a real backend restart.

## Data preservation and outstanding release evidence

No test sent mutations to the personal workspace. Backend clients explicitly
receive pytest temporary Settings. Browser servers use separate
`/tmp/dataforge-e2e-repair-*` homes. No reset, data migration, output sweep, deletion
or database restoration was performed on `backend/storage`. Initial uploads and
outputs directories contained no files. Workspace SQL database SHA-256 remains
`81c177235b40c94941438b224b4780648e1a7b47c88734efde3414a72891da4a`.
Existing configuration, dependencies, start scripts, port bindings and unrelated
source files match the initial manifest; no initial file is missing.

**Metadata physical bytes do not match the initial manifest.** Initial metadata
SHA-256 was `e3ba06536f7dbba337dee3c1c5f01b43660ce276abb54c5cee2d5defc5b970aa`;
final observed SHA-256 is
`8a869744c32d013352b299d3ed5717eabcebe101350b87819e659a21d60186af`.
The initial WAL was nonempty; the observed final WAL is empty, and shared-memory
bytes also changed. The user's existing backend runs with `uvicorn --reload` on
8001; editing watched source can reload it without an explicit stop command.
The changes are consistent with a SQLite WAL checkpoint during reload. This is
not proof that every original logical value is identical.

A final read-only, immutable SQLite inspection reports `integrity_check = ok`,
one notebook, three notebook cells and eight execution records; zero datasets,
pipelines, pipeline-run records and saved queries. Notebook and execution
timestamps all precede this repair. The canonical final table-content digest is
`0dfe44c14a1a1f4ab087556d169927deb5f9c0721337b75922d048246fc22f97`.
See `live-metadata-readonly.json` and `preservation.json`. No write or restoration
was attempted to force physical hashes to match.

**Outstanding acceptance item: full original metadata preservation is UNVERIFIED.**
The initial evidence contains physical hashes, but no consistent SQLite backup or
logical table snapshot including WAL. Those hashes cannot establish logical
equality after checkpointing, and creating a baseline now cannot reconstruct
the earlier state. An independently retained pre-repair backup/logical snapshot
would be needed for a conclusive comparison. There is no observed data loss, but
the mandatory overall release acceptance must not be declared complete on this
evidence alone. This is an evidence blocker, not a failing regression or a reason
to overwrite the live database.

## Exact intentional file changes

Modified:

```text
backend/app/api/routes.py
backend/app/db/session.py
backend/app/services/data.py
backend/app/services/sql.py
frontend/src/app/datasets/page.tsx
frontend/src/app/globals.css
frontend/src/app/history/page.tsx
frontend/src/app/pipelines/page.tsx
frontend/src/app/python/page.tsx
frontend/src/components/shell.tsx
frontend/src/components/ui.tsx
frontend/src/lib/hooks.ts
frontend/tests/workflow.spec.ts
scripts/e2e.sh
docs/API.md
docs/ARCHITECTURE.md
docs/SECURITY.md
```

Added:

```text
backend/app/core/json_values.py
backend/tests/test_remediation.py
frontend/src/lib/save-revision.ts
frontend/tests/fixtures.ts
frontend/tests/remediation.spec.ts
docs/REMEDIATION_REPORT.md
```

Separately observed runtime changes: `backend/storage/metadata.sqlite3`,
`backend/storage/metadata.sqlite3-wal`, `backend/storage/metadata.sqlite3-shm`,
described above. These are not represented as intentional repair edits.

## Remaining operating limits and readiness

All 12 defect-specific repairs are verified. No new external services, schema
migrations, SQL authorizer exceptions, Python limit reductions or port changes
were introduced. Documentation changes describe actual behavior.

The application remains a single-user trusted-local MVP. Python is not a hostile
code sandbox. Multi-process shared-home execution, multi-client edit conflicts,
full cross-database/filesystem atomicity, abrupt-crash artifact reconciliation,
and general production hardening remain outside this repair. A committed ETL
workspace table can survive a subsequent publication failure. Automatic cleanup
does not delete historical/user outputs. No fresh-machine dependency installation,
cross-browser matrix, load test or new dependency security certification was run.
The tests reused installed dependencies in clean source/build/storage copies.

The repaired build supports an honest, bounded local portfolio demonstration
based on the passing workflows. **Unconditional release/remediation completion
is not signed off** until the metadata preservation evidence gap is resolved.
Do not present this report as a production-readiness certification.
