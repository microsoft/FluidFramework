---
"@fluidframework/container-loader": minor
"@fluidframework/container-runtime": minor
"__section": fix
---

Load seed documents without seed-specific host settings

Seed-enabled runtime factories now disable offline snapshot tracking inside the loader after they detect seed content.
Hosts no longer need to identify seed documents or disable offline loading for all documents.
Native snapshots retain their normal offline behavior.
Pending-state capture and restoration remain unsupported for a container loaded from seed content.

The runtime's `untilFirstAck` full-tree policy now ensures that summary acknowledgments are adopted before summary completion, even when immediate refresh is disabled in host configuration.
Use compatible loader and runtime versions together.
