---
"@fluidframework/sea-typescript": minor
"__section": tree
---

Reduce opening-prefetch latency for snapshots with many small directories

Sea opening streams use independent byte windows for events and snapshot content instead of small item-count windows.
Each queued message is charged its opaque payload size plus a conservative fixed allowance for framing and memory overhead.
Consumption returns the same byte charge, preserving backpressure without forcing a network round trip after every eight small content objects.

The wire protocol advances to version 14 because credit messages now represent bytes.
Rebuild and deploy both clients and servers together.
