---
"@fluidframework/container-runtime": minor
---

container-runtime: (GC) Tombstoned objects will fail to load by default

Previously, Tombstoned objects would only trigger informational logs by default, with an option via config to also cause
errors to be thrown on load. Now, failure to load is the default with an option to disable it if necessary. This
reflects the purpose of the Tombstone stage which is to mimic the user experience of objects being deleted.
