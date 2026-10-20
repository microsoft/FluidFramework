---
"@fluidframework/container-loader": minor
"@fluidframework/odsp-driver": minor
"__section": fix
---
Binary summary blob contents are no longer corrupted in Node.js when a Buffer is a view into a larger allocation

In Node.js, binary summary blob content provided as a `Buffer` that covered only part of its underlying memory (for example, a small pooled `Buffer` or the result of `subarray`) could be converted into an `ArrayBuffer` containing the entire underlying memory rather than just the blob's bytes.
This affected snapshots produced from detached container summaries and files created via the ODSP driver from a detached summary, and could result in extra or unrelated bytes being stored with a blob.

Only the bytes belonging to the blob are now included.
Browser environments were not affected.
