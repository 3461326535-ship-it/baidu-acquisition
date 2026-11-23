# Actions

## account-get

Read account balance, budget, state, registered domain and legal entity.

## campaign-get

Read traditional campaign-layer objects. Do not infer project-level oCPC solely from campaign bid fields.

## ocpc-target-package-list-get

Read project-level oCPC target packages. For account-level lookup, use `level=1` and pass the advertising user ID in `ids`.

Join `scope[].levelId` to `campaignId`. In the current Baidu UI, `targetPackageId` corresponds to the project ID shown in the project URL.

## report-data-get

Use `scripts/reports/registry.ts` to build and validate report requests. Never assume a column supported by one report type is valid for another report type.

Use `scripts/reports/fetch.ts` for pagination. It reports whether a result was truncated at the configured safety limit.

The `diagnose search-terms` workflow ranks zero-reported-conversion rows for review using spend and click thresholds. It deliberately does not classify them as irrelevant or write negative keywords.

## negative-keyword-get

Read campaign- and ad-group-level negatives. Always request explicit fields and a `[0, 5000]` limit; an empty body can be misread as an empty account.

`diagnose negatives` compares current negatives with keyword report rows at the applicable campaign or ad-group scope. Findings are possible conflicts, not authorization to delete.

## Composed diagnostics

- `diagnose hierarchy`: joins campaign objects with campaign, ad-group, and keyword reports.
- `diagnose match-deviation`: flags automatic matching, deleted source keywords, and low lexical similarity for review.
- `diagnose products`: checks an explicit product configuration. Required and forbidden model terms are kept separate so one model cannot silently substitute for another.

