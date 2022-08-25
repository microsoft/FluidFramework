# dependency-tracking

This module contains types and functionality for tracking of data dependencies in computations.
This is done via a bidirectionally linked DAG which is constructed when computing, and used to propagate invalidation.
