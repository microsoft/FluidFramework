# Shared Tree Core

Provides a SharedObject for a tree which handles the collaboration window, and keeping indexes up to date.

Can be parameterized over:

 - a set of field kinds (includes operations for for these kinds)
 - history handling policy (keep none, keep main, keep timeline, keep branches)
 - indexes
 - Rebaser

When summarizing, indexes are given a chance to record their state.
Storing the current tree state (ex: using a forest to accumulate changes) is treated like any other index,
and this this module does not have to depend on forest,
it just provides an index contract / interface which can be used for that purpose.

# Status

Implementation is really just some notes/ideas, and nothing close to usable.
