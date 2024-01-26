---
"@fluidframework/runtime-definitions": minor
---

IFluidDataStoreChannel.getAttachSummary replaced by new function getAttachSummaryAndGCData

When creating a DDS attach message, we now need both the summary and GC Data.
The new function returns a tuple of these. Typically a caller will either serialize and add the GC Data
to the summary, or will pass the data up to a higher level to do so (incorporating the same from other DDSes as well).
