---
"fluid-framework": minor
"@fluidframework/sequence": minor
---

Stop ISharedString extending SharedObject

ISharedString no longer extends SharedSegmentSequence and instead extends the new ISharedSegmentSequence, which may be missing some APIs.

Attempt to migrate off the missing APIs, but if that is not practical, request they be added to ISharedSegmentSequence and cast to SharedSegmentSequence as a workaround temporally.
