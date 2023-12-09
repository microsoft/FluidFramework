---
"@fluidframework/container-runtime": minor
---

GC: Tombstoned objects will fail to load by default

Previously, by default Tombstoned objects would merely trigger informational logs, with an option via config
to also cause errors to be thrown on load. Now failure to load is the default, with an option to disable it if necessary.
This reflects the purpose of Tombstone stage which is to mimic the user experience of having objects deleted.
