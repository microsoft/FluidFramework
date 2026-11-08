---
"tinylicious": minor
"__section": fix
---

Restore Tinylicious connections with a LevelDB database

Tinylicious configured with `db.inMemory=false` now supports the checkpoint collection needed when clients connect to a document.
Previously, connections failed with `Collection checkpoints not implemented.`
LevelDB upserts now preserve identity fields from the filter when inserting a record, allowing service checkpoints to be stored and retrieved correctly.
The default in-memory configuration and LevelDB synchronization settings are unchanged.
