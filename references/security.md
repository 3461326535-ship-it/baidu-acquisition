# Security

- Store credentials outside the skill directory.
- Never put tokens or secrets in command-line payloads, logs, fixtures, reports, or replies.
- Redact credential-shaped fields before recording errors.
- Treat every write as high impact until a workflow explicitly classifies it.
- Require current-value lookup, dry-run, explicit user confirmation, execution, verification, and rollback data.
- On partial success, retry only items identified by failure positions.

