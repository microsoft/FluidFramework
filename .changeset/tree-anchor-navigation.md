---
"@fluidframework/tree": minor
"__section": tree
---
Reduce navigation overhead for SharedTree reads and edits

SharedTree reuses existing field and parent information to avoid unnecessary cursor navigation and temporary anchors.
This reduces overhead for repeated object-field access, parent and key queries, and locating fields for edits, including in deeply nested trees.
No public API or stored document format changes are required.
