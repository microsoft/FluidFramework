---
"__section": other
---
Observe durable Rust storage write pressure

Durable-file callers can obtain a per-document pressure handle with `view.blobs().write_pressure()` before constructing a sequencer.
The handle reports content-preparation and queued/in-flight mutation charges separately and can wait for both budgets to be at or below caller-selected ceilings.
It wakes on capacity release or terminal opening failure without retaining the document or reserving capacity.

Existing admission limits, saturation rejection, cancellation, and accepted-write behavior are unchanged.
The observations are advisory conservative charges, not a hard process-memory bound.
Buffered storage does not expose this handle, and no session backpressure policy is enabled.
