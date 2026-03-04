# Type-Test Updates

Use this guide when release work requires compatibility/type-test updates.

## Goals

- Keep previous-version type tests aligned with new releases
- Update package configuration safely and consistently

## Common commands

```bash
flub typetests --dir . --previous --normalize
flub generate typetests --dir .
```

## Verification

1. Ensure generated type-test files/config are consistent.
2. Run compile/test tasks for impacted packages.
3. Summarize changed compatibility expectations.
