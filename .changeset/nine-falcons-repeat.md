---
"@fluidframework/container-runtime": major
---

`IRootSummaryTreeWithStats` removed

`IRootSummaryTreeWithStats` was the return type of `summarize` method on `ContainerRuntime`. It was an internal interface used only in `ContainerRuntime` class to to access `gcStats` from a call site. `gcStats` is not needed in the call site anymore so this interface is removed.
