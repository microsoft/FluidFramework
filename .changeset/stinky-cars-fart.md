---
"@fluidframework/tree": minor
---
---
"section": tree
---

Added a new `changed` event to the (currently alpha) `TreeBranchEvents` that is meant to replace the `commitApplied` event on `TreeViewEvents`.
This new event is fired for both local and remote changes and maintains the existing functionality of `commitApplied` that is used for obtaining `Revertibles`.

The `commitApplied` event is now deprecated.
