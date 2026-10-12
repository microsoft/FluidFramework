---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Added checks against document corruption in debug builds

This version adds additional runtime checks to detect errors in the rebasing (commit merging) layer.
These checks are tree-shaken out of production builds, so they have no impact on shipped applications.
These checks can be used to facilitate root cause analysis when faced with a SharedTree bug that can be reproduced in non-production builds.

There are three levels of checking available:
* `RebaseValidation.Level.None`: No rebase validation is performed.
* `RebaseValidation.Level.Cheap`: A minimal amount of rebase validation is performed, with minimal performance overhead.
* `RebaseValidation.Level.Strict`: Extensive rebase validation is performed, with the highest performance overhead.

The level is set to `RebaseValidation.Level.Cheap` by default.
It can be adjusted by calling `RebaseValidation.setLevel` or `RebaseValidation.runWithLevel`.
