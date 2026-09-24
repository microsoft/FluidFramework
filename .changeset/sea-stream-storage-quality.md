---
"@fluidframework/sea-typescript": minor
"__section": fix
---
Improve Sea stream lifetime and progress guarantees

Sea preserves read-progress observations and releases browser transport resources when connection attempts, streams, or snapshot coordination are cancelled or dropped.
Protocol handling rejects trailing payload bytes, mismatched author receipts, and incomplete content responses instead of accepting malformed or truncated results.
Disconnected clients reject datagram operations even when physical disconnection fails.

The Rust service also bounds retained submission and signal payload backing, preserves completed file-stream ownership until drop, and strengthens content publication and namespace synchronization.
Snapshots can use any committed session-event boundary, including membership events; this clarifies existing behavior rather than adding a restriction.

Same-connection session replacement still has a known stale-stream authority limitation.
Native client per-frame deadlines after opening remain unimplemented; server-side deadlines are not a substitute for that client guarantee.
