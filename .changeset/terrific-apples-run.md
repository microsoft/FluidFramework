---
"@fluidframework/tree": minor
---
---
kind: tree
---

SharedTree content that is removed is now deleted

SharedTree now supports garbage collection so that removed content is not retained forever.
This is an internal change and users of SharedTree won't need to adapt any existing code.

This change could cause errors with cross-version collaboration where an older client does not send data that a newer
version may need. In this case, a "refresher data not found" error will be thrown.
