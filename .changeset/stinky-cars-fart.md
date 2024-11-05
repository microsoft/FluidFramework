---
"@fluidframework/tree": minor
---
---
"section": tree
---

Provide more comprehensive replacement to the `commitApplied` event

Adds a new `changed` event to the (currently alpha) `TreeBranchEvents` that replaces the `commitApplied` event on `TreeViewEvents`.
This new event is fired for both local and remote changes and maintains the existing functionality of `commitApplied` that is used for obtaining `Revertibles`.
