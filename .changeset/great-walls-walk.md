---
"@fluidframework/merge-tree": patch
"__section": fix
---
Fix `LocalReferenceCollection.walkReferences` skipping the starting reference

`LocalReferenceCollection.walkReferences` compared the wrong objects when locating the
before/at/after bucket containing the supplied `start` reference. It compared list nodes of the
outer bucket list against the list node of `start` itself, which never match, so the walk discarded
every bucket at `start`'s offset and began at the next offset instead. As a result, a walk with an
explicit `start` never visited `start` or any other reference at its offset.

The walk now stops at the bucket containing `start` and resumes from `start` within that bucket, so
`start` is visited first in both the forward and backward directions.
