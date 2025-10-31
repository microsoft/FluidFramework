---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add IndependentTree API

New `IndependentTreeAlpha` and `IndependentTreeBeta` APIs provide similar utility to the existing alpha [`IndependentView`](https://fluidframework.com/docs/api/tree#independentview-function) API, except providing access to the [`ViewableTree`](https://fluidframework.com/docs/api/fluid-framework/viewabletree-interface).

This allows for multiple views (in sequence, not concurrently) to be created to test things like schema upgrades and incompatible view schema much more easily.
For `IndependentTreeAlpha`, this also provides access to `exportVerbose` and `exportSimpleSchema` from [`ITreeAlpha`](https://fluidframework.com/docs/api/tree/itreealpha-interface).
