---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"__section": fix
---
Data store attach messages now include DDSes created while the attach message is generated

Generating a data store's attach message captured the data store's summary and its garbage collection data in two
separate passes. A DDS that synchronously created another DDS while either pass ran could end up in only one of
them. The new DDS still became visible locally and started sending ops, but remote clients never learned about it
from the attach message and failed to process those ops.

The summary and the garbage collection data are now captured together and always describe the same, complete set
of DDSes. Relatedly, processing an op for an unknown DDS now throws a `DataProcessingError` with diagnostics
instead of an assert.
