---
# The original change was added in commit: 7793c4448e47991f89e792c321551ffd4d1d3a03
"@fluidframework/sequence": minor
---

IntervalConflictResolver deprecation

In `SharedString`, interval conflict resolvers have been unused since [this
change](https://github.com/microsoft/FluidFramework/pull/6407), which added support for multiple intervals at the same
position. As such, any existing usages can be removed. Related APIs have been deprecated and will be removed in an
upcoming release.
