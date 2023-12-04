---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
"@fluidframework/undo-redo": major
---

Add experimental support for the obliterate operation

This change adds experimental support for obliterate, a form of remove that deletes concurrently inserted segments. To use: enable the `mergeTreeEnableObliterate` feature flag and call the new `obliterateRange` functions.

Note for `sequence` users: this change may cause compilation errors for those attaching event listeners. As long as obliterate isn't used in current handlers, their current implementation is sound.
