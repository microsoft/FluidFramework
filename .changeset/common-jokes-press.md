---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Add alpha API for snapshotting Schema

`extractPersistedSchema` can now be used to extra a JSON compatible representation of the subset of a schema that gets stored in documents.
This can be used write tests which snapshot an applications schema.
Such tests can be used to detect schema changes which could would impact document compatibility,
and can be combined with the new `comparePersistedSchema` to measure what kind of compatibility impact the schema change has.
