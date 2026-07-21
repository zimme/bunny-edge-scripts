---
name: change-ddns-behavior
description: Modify or review DDNS endpoint parsing, authentication, response codes, hostname handling, IP handling, or record-update behavior in the Bunny DDNS runtime.
---

# Change DDNS behavior

1. Read the API and security sections in `README.md` and the package exports in
   `packages/bunny-ddns-edge-script/src/mod.ts`.
2. Change `packages/bunny-ddns-edge-script/src/app.js`; keep runtime adaptation
   in `src/main.js` and `src/dev.js` thin.
3. Preserve HTTPS enforcement, Basic Auth, query-credential rejection,
   deny-before-allow evaluation, explicit update addresses, and conservative
   multi-record behavior unless the task explicitly changes the contract.
4. Add focused cases to `packages/bunny-ddns-edge-script/tests/app.test.ts`,
   including rejection and Bunny API failure paths.
5. Run `npm run test` and `npm run build` while iterating.
6. Update public API, configuration, response-code, and security documentation.
7. Run `npm run validate` inside the Dev Container and review generated package
   contents before handoff.
