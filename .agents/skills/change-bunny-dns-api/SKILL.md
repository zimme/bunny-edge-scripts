---
name: change-bunny-dns-api
description: Modify or review Bunny DNS zone discovery, record matching, record creation, mutation payloads, pagination, or Edge Scripting subrequest-budget behavior.
---

# Change Bunny DNS API behavior

1. Read the Bunny DNS API references in `README.md` and the current client logic
   in `packages/bunny-ddns-edge-script/src/app.js`.
2. Verify current Bunny API behavior from primary documentation when changing
   endpoints, payloads, limits, or response handling.
3. Preserve existing record settings and longest-zone matching. Reject ambiguous
   record sets unless `DDNS_MULTI_RECORD_MODE=update-all` is explicit.
4. Preflight the complete mutation plan against Bunny's subrequest limit before
   making the first write.
5. Add tests for pagination, root records, zone selection, mutation payloads,
   partial-failure prevention, and upstream errors as applicable.
6. Update API and operational documentation, then run `deno task validate`
   inside the Dev Container.
