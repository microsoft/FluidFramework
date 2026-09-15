---
"@fluidframework/sequence": patch
"__section": fix
---
Fix interval iteration by start and end position returning nothing

`ISequenceOverlappingIntervalsIndex.gatherIterationResults` gathered no intervals at all when it was
given both a start and an end position. It compared the range being searched for against each
interval using an ordering that includes interval id, and the range being searched for is described
by a temporary interval assigned a fresh random id, so nothing could ever compare equal to it.
Gathering by start position alone, by end position alone, or with no bounds was unaffected.

Interval ids are no longer considered when gathering, so passing both a start and an end position now
yields every interval spanning exactly that range.
