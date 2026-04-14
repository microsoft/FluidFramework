---
"@fluidframework/tree": minor
"__section": fix
---
Array node nodeChanged delta payload now populated for unhydrated nodes

The `delta` field in `NodeChangedDataDelta` was previously `undefined` for array nodes that had not yet been inserted into a document tree (unhydrated nodes). It now correctly reflects the operation that was performed, using the same [Quill](https://quilljs.com/docs/)-style semantics as hydrated nodes.
