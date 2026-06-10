## Agent Summary

Describe the behavior change and why it is needed.

## Verification

- [ ] `deno task ci`
- [ ] `deno task build`
- [ ] `deno publish --dry-run` passes for changed JSR packages
- [ ] `npm pack --dry-run` contains the expected generated `dist/` files, when
      source changed

## Security Notes

Call out any changes to authentication, authorization, hostname scope, record
mutation behavior, or secret handling.
