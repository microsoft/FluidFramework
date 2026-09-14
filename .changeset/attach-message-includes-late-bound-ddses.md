---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"__section": fix
---
Attach summaries now include DDSes bound while the summary is generated

Generating a detached container's attach summary visits its data stores in sequence. Summarizing a later data store
can bind a DDS owned by an earlier data store through normal handle serialization. The earlier data store's
already-captured summary then omits the DDS even though it becomes visible locally and can send ops after attach.

Attach capture now tracks changes to each data store's set of bound DDSes and recaptures data stores until the
container-wide summary is stable. Within each data store, the summary and garbage collection data are also captured
together so custom channels cannot make the two disagree by binding a DDS during either pass.

Processing an op for an unknown DDS now throws a `DataProcessingError` with detailed diagnostics instead of an
opaque assert, making any remaining causes easier to identify.
