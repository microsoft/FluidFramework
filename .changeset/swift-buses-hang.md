---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Retain history option

Adds a new `retainHistory` flag to [`SharedTreeOptions`](https://fluidframework.com/docs/api/tree/sharedtreeoptions-interface) (defaults to `false`).
Setting `retainHistory` to `true` will prevent SharedTree from garbage-collecting historical data about old changes.
Note that this will cause unbounded growth both in memory on the client and in summaries/snapshots (the at-rest data representing a Fluid document).
For these reasons, this option is only intended for debugging and experimentation.
