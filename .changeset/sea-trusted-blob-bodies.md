---
"__section": other
---
File-backed Sea blob downloads use bounded application buffers

Rust storage and session APIs expose additive owned, known-length blob bodies while retaining their materialized compatibility APIs.
For example, `let body = store.open_blob(id).await?; body.copy_to(&mut writer).await?;` copies only the declared extent and reports a short read.
An opened file body retains its resources until it is consumed or dropped, including completion of already-dispatched filesystem work after cancellation.

The server sends these bodies over WebTransport and WebSocket without collecting large file-backed payloads.
Demand batches prepare up to two queued items, collecting only reader bodies at most 4 KiB.
Large bodies remain streamed, and opening-prefetch credit behavior is unchanged.
WebSocket output combines short writes into bounded records and flushes each complete frame.
Wire formats and byte-returning clients are unchanged; compression, encryption, and remote-source sessions still materialize their decoded results.
Custom Rust `SeaConnectionService` implementations now return `SeaContentStream` for content.
Wrap an existing wire response with `SeaContentResponse::from(response)`, or return `SeaContentResponse::Blob { id, body }` to stream an owned body.
Logical opening-content cancellation finishes any started frame under its original deadline.
A read or write failure during a frame aborts its physical stream; on the shared opening stream this can fail both content and events.
