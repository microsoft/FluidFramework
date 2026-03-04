# Release Schedule Reference

Use this guide to reason about sequencing and timing for Fluid releases.

## Inputs to gather

- Target release group (`client`, `server`, `build-tools`)
- Release type (`patch`, `minor`, `major`)
- Intended branch/tag and any policy or approver constraints
- Whether release notes/issues need to be updated

## Suggested sequence

1. Confirm branch and approval readiness.
2. Confirm changesets and release-note inputs are ready.
3. Schedule execution when approvers and release owners are available.
4. Plan post-release verification (tags, reports, and GitHub Release status).

## Helpful commands

```bash
flub release history -g client -l 10
flub check changeset --branch main
```
