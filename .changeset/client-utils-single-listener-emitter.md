---
"@fluid-internal/client-utils": minor
"__section": other
---
Reduce the memory used by event emitters with one listener per event

An event emitter now keeps an event's only listener directly, and creates a set of listeners only when the event has a second one.
Most emitters have one listener per event: for example, a tree node with a `nodeChanged` listener uses about 300 bytes less memory.