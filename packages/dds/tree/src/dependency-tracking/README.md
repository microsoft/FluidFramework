# dependency-tracking

This module contains types and functionality for tracking of data dependencies in computations.
This is done via a bidirectionally linked DAG which is constructed when computing, and used to propagate invalidation.

TODO:
Eventually shared tree should support sending scoped deltas to consumers to specific subtrees.
This might make sense to be part of the invalidation APIs in this module.
