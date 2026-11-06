---
"@fluidframework/sea-tree": minor
"@fluidframework/sea-driver": minor
"@fluidframework/tree": minor
"__section": tree
"__includeInReleaseNotes": false
---
Support blob handles and configurable snapshot prefetch in the direct Sea host

The internal direct SharedTree host can create immediately available blob handles with observable upload state.
Referenced uploads complete before operation submission.
Locally available bytes remain readable offline and after host disposal.

Snapshot loading leaves application blob payloads lazy by default.
Applications can select eager loading to fetch them during opening.
Snapshot version 4 stores native blob-reference edges alongside each serialized summary blob so incremental reuse preserves reachability.
Versions 2 and 3 remain readable and migrate on the next summary.
Update all collaborating direct clients before using blob handles or publishing version 4 snapshots.
