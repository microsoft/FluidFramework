---
"@fluidframework/sequence": patch
"__section": fix
---
Fix intervals sharing an end position being dropped from the endpoint index

`IIntervalCollection.previousInterval` and `nextInterval` are backed by an index that ordered
intervals by end position alone. Because that ordering treats any two intervals ending at the same
position as the same entry, only one of them could be held at a time: adding a second interval with
an existing end position overwrote the first, and removing either one evicted both. Intervals that
were still present in the collection could therefore be missing from the results of
`previousInterval` and `nextInterval`.

The index now orders by end position and then by interval id, so intervals sharing an end position
are stored and removed individually. Lookups continue to match on end position alone, so
`previousInterval` and `nextInterval` return the same results as before whenever end positions were
already distinct.
