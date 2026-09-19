---
"@fluidframework/sea-typescript": minor
"@fluidframework/sea-driver": minor
"__section": feature
"__includeInReleaseNotes": false
---
Add live document signals to Sea sessions and the Fluid driver

Neutral sessions support opaque broadcast and targeted messages without persisting them in document history.
Reliable delivery is the default; applications can explicitly request best effort, which uses WebTransport datagrams when available and small enough, or reliable fallback otherwise.
The Fluid driver uses reliable signals, including targeted delivery and live audience membership.
Rebuild the Sea client and server together for protocol version 8.

```typescript
const signals = await session.openSignals({ id: connectionId, metadata: new Uint8Array() });
const members = await signals.next();
await signals.send(payload);
await signals.send(payload, { target: peerId, delivery: "bestEffort" });
await signals.close();
```

Messages have no persistence, replay, or ordering guarantee relative to document operations.
The current remote host permits one signal registration per transport connection lifetime and remains unauthenticated experimental infrastructure.