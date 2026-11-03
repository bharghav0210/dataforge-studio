# Security and operating boundaries

This is a **single-user trusted-local MVP**, not a production service or malicious-code sandbox. Bind both services to loopback. Do not expose them to a LAN, public proxy, or the internet. Do not run untrusted Python or open this application while using an OS account that has sensitive production access.

## Implemented measures

- Python runs outside FastAPI using an argument list, without shell interpolation. Isolated interpreter mode disables user site/custom Python paths. An allowlisted child environment omits application credentials and inherited environment secrets. The session's HOME/TMPDIR point to a temporary directory.
- Default Python limits: 10 seconds wall time; 10 seconds CPU with a one-second hard-limit margin; 1 GiB virtual address space; 64 open file descriptors; 10 MiB per output file on Unix. stdout and stderr share a 65,536-byte cap. A fresh process group is killed on completion, timeout or overflow, then waited for. Temporary session directories are cleaned up.
- These limits are operational guardrails. Python can still read or change host files and use network/process facilities permitted by the OS user. A child can deliberately escape process-group cleanup. Filesystem access means environment scrubbing cannot prevent deliberate secret discovery. There is no seccomp, container, namespace, network isolation, or independent runtime identity. Windows execution has not been verified; Unix process-group behavior is required by this implementation.
- The SQL workspace is physically separate from application metadata. Read-only mode is enforced by SQLite URI flags and an authorizer. Write mode only allows row mutations against existing tables. ATTACH, PRAGMA, schema mutation and extension/file functions remain denied. Inputs are executed as one SQL statement; dynamic table identifiers in import are validated. Connections receive a progress deadline and lock timeout. Python intentionally remains capable of directly reading local files, including the databases.
- Uploads have a 10 MiB file limit and HTTP request bodies are bounded during parsing at that limit plus 1 MiB multipart overhead. CSV/XLSX extensions, readable content, nonempty data, 100,000-row and 100-column limits are checked. Excel declared expanded ZIP content is capped at 50 MiB. Files are given server UUID names; client paths are never used as storage paths. The multipart parser can normalize Windows-style filenames before application validation. Uploaded workbooks are parsed, not executed.
- Dataset downloads and ETL downloads resolve server-recorded files. A user cannot supply an arbitrary database or download path. Imports fail if a table already exists. Pipeline reruns create unique destinations. Deleting an upload does not remove previously imported SQL tables.
- Pipeline JSON uses typed operations with bounded step counts. No eval, Python snippets, arbitrary SQL, or Pandas query expressions are accepted in transformations.
- CSV row widths are validated before loading. Non-finite result numbers have explicit string markers at JSON persistence/API boundaries. ETL validates its preview before destination writes, writes CSV to an exclusively created staging file, then publishes using an atomic no-overwrite hard link on the same filesystem. Caught failures remove only that execution's staging file and any published link still pointing to its owned inode. Existing outputs and name collisions are preserved.
- CORS permits the local frontend. An Origin check rejects browser requests from other origins (including simple multipart form POSTs). TrustedHost rejects unrelated hostnames. This is defense in depth, not user authentication. Non-browser local clients can access the APIs.
- Generated editor assets use the pinned patched DOMPurify module, including substitution for Monaco's vendored copy. Dependency scanning is a point-in-time check, not proof of security.
- Storage, virtual environments, environment files, generated bundles, logs and test screenshots are ignored by Git. No GitHub push or public deployment is part of setup.

## Deferred / limitations

Authentication, TLS, CSRF tokens beyond Origin checks, rate limits, job concurrency limits, encrypted storage, user isolation, audit immutability, disk quotas, file malware scanning, dependency update automation and production hardening are deferred. Workbooks/CSV inputs are resource-bounded but not hardened against every parser exploit. CSV downloads preserve original values and do not neutralize spreadsheet formula strings; inspect data before opening it in spreadsheet software.

Requests execute synchronously and can contend for CPU, memory, database locks and disk. An interrupted backend can leave external effects, orphan artifacts or descendants; restart reconciliation marks interrupted history failed but does not roll back Python side effects. No security audit, load test, or production-readiness claim has been made.

ETL compensation covers ordinary caught failures, including destination, CSV write,
publication and metadata-commit errors. It is not a transaction spanning both
SQLite databases and the filesystem. A table already committed to the workspace
can survive a later failure; abrupt process/OS termination or cleanup I/O failure
can leave artifacts. There is no automatic scan that deletes historical or
user-created outputs. Hard-link publication requires a local filesystem supporting
hard links; unsupported publication fails the execution rather than overwriting a
destination.

Tests cover rejected file types, file-size limits, traversal filenames, malformed uploads, SQL metadata/ATTACH/PRAGMA/extension restrictions, invalid SQL, recursive-query interruption, malformed pipeline definitions, Python exceptions, timeout and output exhaustion. Tests use fresh temporary homes and do not overwrite user storage.
