---
"@fluidframework/merge-tree": major
"@fluidframework/sequence": major
"@fluidframework/undo-redo": major
---

sequence: Add experimental support for the obliterate operation

This change adds experimental support for _obliterate_, a form of _remove_ that deletes concurrently inserted segments.
To use, enable the `mergeTreeEnableObliterate` feature flag and call the new `obliterateRange` functions.

Note: this change may cause compilation errors for those attaching event listeners. As long as obliterate isn't used in
current handlers, their current implementation is sound.
