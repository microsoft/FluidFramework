---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
section: tree
---

Implicit TreeNode construction improvements

ArrayNodes and MapNodes could always be explicitly constructed (using `new`) from iterables.
The types also allowed using of iterables to construct implicitly construct array nodes and map nodes,
but this did not work at runtime.
This has been fixed for all cases except implicitly constructing an ArrayNode form an `Iterable` that is actually a `Map`,
and implicitly constructing a MapNode from an `Iterable` that is actually an `Array`.
These cases may be fixed in the future, but require additional work to ensure unions of array nodes and map nodes work correctly.

Additionally MapNodes can now be constructed from `Iterator<readonly [string, content]>` where previously the inner arrays had to be mutable.
