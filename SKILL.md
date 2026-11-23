---
name: baidu-acquisition
description: Diagnose and safely operate Baidu Search Marketing accounts through official APIs, including account status, projects, campaigns, oCPC target packages, conversion goals, reports, search terms, and guarded write operations. Use for Baidu advertising audits, performance diagnosis, project-to-campaign mapping, oCPC checks, and approved account changes. Use browser inspection only when official APIs cannot provide required fields.
---

# Baidu Acquisition

Use `scripts/cli.ts` as the only API entrypoint. Never call Baidu endpoints directly from a workflow.

## Core workflow

1. Resolve credentials from environment variables and the external token store.
2. Select the concrete advertising account before querying business endpoints.
3. Route the request to an action or a composed workflow.
4. Normalize raw API data before drawing business conclusions.
5. For project-level oCPC conclusions, always join target packages with campaigns through `scope[].levelId`.
6. Treat campaigns outside a target package as `outsideProjectCampaigns`; do not label them CPC without separate bid-strategy evidence.
7. Search-term candidates are review queues, never automatic negative keywords. Cross-check product relevance, CRM outcomes, and conversion tracking first.
8. Prefer official APIs. Use browser inspection only for fields unavailable through the API.
9. For writes, produce a dry-run preview, obtain explicit confirmation, execute, query again, and retain an audit record.

## Commands

```powershell
node scripts/cli.ts account get --user-name "ACCOUNT"
node scripts/cli.ts campaign list --user-name "ACCOUNT"
node scripts/cli.ts project list --user-name "ACCOUNT" --user-id 123
node scripts/cli.ts diagnose projects --user-name "ACCOUNT" --user-id 123
node scripts/cli.ts diagnose account --user-name "ACCOUNT" --user-id 123 --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose search-terms --user-name "ACCOUNT" --start-date 2026-11-01 --end-date 2026-11-07 --review-cost 20
node scripts/cli.ts diagnose hierarchy --user-name "ACCOUNT" --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose match-deviation --user-name "ACCOUNT" --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose negatives --user-name "ACCOUNT" --start-date 2026-11-01 --end-date 2026-11-07
node scripts/cli.ts diagnose products --user-name "ACCOUNT" --products-file config/products.json
```

Read `references/actions.md` for action inputs and `references/security.md` before adding write operations.

## Guarded writes

Writes use a plan file. Never invent IDs; resolve names via dry-run first. The dry-run prints a
confirmation token; execution without that exact token is refused. Every execution is appended to
`~/.baidu-acquisition/audit.jsonl`.

```powershell
node scripts/cli.ts write dry-run --plan plan.json
node scripts/cli.ts write execute --plan plan.json --confirm TOKEN
```

Plan format:

```json
{
  "userName": "ACCOUNT",
  "operations": [
    { "type": "negative-delete", "ids": [123], "reason": "why" },
    { "type": "negative-add", "campaignName": "计划名", "words": [{ "word": "词", "match": "phrase" }] },
    { "type": "keyword-add", "adgroupId": 456, "words": [{ "word": "词", "match": "phrase", "price": 5.5 }] },
    { "type": "keyword-delete", "ids": [789], "reason": "why" }
  ]
}
```

`match` accepts `phrase` / `exact`. Negative adds are campaign-level; keyword adds need a concrete
`adgroupId`. Always dry-run, show the preview to the user, and execute only after explicit approval.

