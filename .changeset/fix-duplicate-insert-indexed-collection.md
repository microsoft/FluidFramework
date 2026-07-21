---
"@fluid-experimental/property-changeset": patch
"__section": fix
---

Crash-looping from duplicate inserts in indexed collection ChangeSets has been fixed

Previously, merging a ChangeSet into an indexed collection (a set- or map-typed property) would throw `CS-003: Internal error: Added an already existing entry` whenever the incoming insert's key already had an insert recorded in the base ChangeSet — even when the two inserts were identical, such as from a duplicated or replayed operation. Because this merge runs on the normal op-processing path, a duplicate op could put a document's summarizer into a crash-loop.

Now, an insert that exactly matches an already-recorded insert for the same key is treated as a safe no-op. A mismatched value for the same key is still treated as a genuine conflict and continues to throw.
