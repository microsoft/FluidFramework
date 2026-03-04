# Release Execution

Use this guide on release day.

## Execution flow

1. Resolve release metadata from tag or release group context.
2. Generate release artifacts/reports.
3. Publish or draft GitHub release as appropriate for the group.
4. Validate final outputs (tag, notes, attached artifacts).

## Common commands

```bash
flub release fromTag <group>_v<version> --json
flub release report -g <group> -o reports
```

## Validation points

- Release notes generated and attached
- Manifests/reports are available
- Release visibility (draft vs published) matches policy
