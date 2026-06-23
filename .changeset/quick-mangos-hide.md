---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Forks created on "changed" event are no longer auto-disposed

The "changed" event is emitted from a `TreeBranch` when a change is made to the branch.
Previously, when this event was fired due to a transaction being committed, it was possible to fork the branch in response to the "changed" event, but such a fork would be automatically disposed immediately after the event callback.
This was a bug. Such forks are no longer disposed automatically.
