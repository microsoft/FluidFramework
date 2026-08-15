---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Additional change validation options

Adds the following new options to `SharedTreeOptions` (alpha):
- validateCommitsOnFirstSubmission: (default: `false`) When `true`, validates that commits being submitted for the first time can be applied without errors to a view.
- validateRebasedCommitsBeforeResubmission: (default: `false`) When `true`, validates that the commits being resubmitted can be applied without errors to a view.

In the event that a commit cannot be applied, SharedTree will throw an error and will enter a "broken" state, preventing the offending commit (and any further commits) from being submitted.
This can be enabled (at the cost of performance) to improve safety against document corruption in the event of a bug in the SharedTree code:
when the additional validation is enabled, a client will error instead of potentially corrupting the document.

These flags are experimental.
We recommend turning them on (first `validateRebasedCommitsBeforeResubmission` and, if needed, `validateCommitsOnFirstSubmission`)
when trying to mitigate bugs in SharedTree or performing root cause analysis.
