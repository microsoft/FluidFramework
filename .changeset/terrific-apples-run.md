---
"@fluidframework/tree": minor
---

Adds garbage collection for repair data so that removed content is not retained forever. This is mostly an internal change so users of SharedTree won't need to adapt any code but it could cause an issue with cross-version collab where an older version does not send a refresher that a newer version may need. In this case, a "refresher data not found" error will be thrown.
