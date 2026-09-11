---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Fix compact snapshot loading with pooled Node.js buffers

Compact snapshots can now be loaded when their binary data is represented by a `Uint8Array` view
with a non-zero `byteOffset`. This prevents container load failures in Node.js 24.18 and later,
where the larger buffer pool causes more file reads to return pooled buffer views.
