---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Adds debug-only checks to facilitate root cause analysis of SharedTree bugs

This version adds additional runtime checks to detect errors in the rebasing (commit merging) layer.
These checks can be used application authors when faced with a SharedTree rebasing bug.
For example:
```typescript
import { RebaseValidation } from "@fluidframework/tree/alpha";

it("repro SharedTree bug", () => {
	// Reproduce the SharedTree bug under strict rebase validation level.
	RebaseValidation.runWithLevel(RebaseValidation.Level.Strict, () => {
		// Buggy scenario
		// ...
	});
});
```
Running the test with strict validation is more likely to yield actionable feedback for SharedTree maintainers.

These checks are tree-shaken out of production builds, so they have no impact on shipped applications.

There are three levels of checking available:
* `RebaseValidation.Level.None`: No rebase validation is performed.
* `RebaseValidation.Level.Cheap`: A minimal amount of rebase validation is performed, with minimal performance overhead.
* `RebaseValidation.Level.Strict`: Extensive rebase validation is performed, with the highest performance overhead.

The level is set to `RebaseValidation.Level.Cheap` by default.
Debug builds may therefore experience asserts in scenarios where they did not before.
The level can be adjusted by calling `RebaseValidation.setLevel` or `RebaseValidation.runWithLevel`.
