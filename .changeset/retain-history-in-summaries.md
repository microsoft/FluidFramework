---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
retainHistory now retains history in summaries

The `retainHistory` option on `SharedTreeOptions` is documented as causing growth in summaries/snapshots as well as in memory, but it only ever prevented trunk commits from being evicted from memory.
Summaries continued to contain just the collaboration window, so retained history was discarded at the next summary and was unavailable to clients that loaded from it.

Summaries produced by a client with `retainHistory` enabled now contain the full trunk, matching the option's documented behavior.
History accumulated while the flag is enabled survives summarization and is available to clients that join later.
History is only retained from the point at which the flag is enabled: commits that were already evicted by a prior session cannot be recovered.

There is no change to the default (`retainHistory: false`) behavior, and no change to the persisted format.
