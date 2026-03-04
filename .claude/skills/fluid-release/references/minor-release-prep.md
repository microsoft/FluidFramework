# Minor Release Preparation

Checklist for preparing a minor release.

## Prep checklist

1. Ensure changesets exist and are valid.
2. Confirm release notes inputs are present and reviewable.
3. Verify branch protection/approval requirements are satisfied.
4. Ensure CI is green for relevant packages/groups.

## Common commands

```bash
flub check changeset --branch main
flub generate releaseNotes -g client -t minor --includeUnknown --headingLinks
flub release prepare -g client
```

## Expected output

- Clear go/no-go summary
- Any blockers called out with exact remediation steps
