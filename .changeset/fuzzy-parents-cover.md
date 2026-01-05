---
"@fluidframework/map": minor
"__section": breaking
---
map: Emit valueChanged events for deleted keys after a clear operation

When a `clear` op is processed on SharedMap, `valueChanged` events are now emitted for each key that was deleted. Previously, only the `clear` event was emitted with no subsequent `valueChanged` events.
