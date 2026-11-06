---
"@fluidframework/sea-driver": minor
"@fluidframework/sea-typescript": minor
"__section": feature
"__includeInReleaseNotes": false
---
Prefetch snapshot content during SEA loading

SEA sessions can stream typed blob trees with bounded breadth-first descendant hints.
Initial loads carry content on the existing opening stream, with event and content consumption and cancellation controlled independently.
The experimental direct SharedTree editor opts into prefetch; a bounded decoded-content cache avoids redundant directory and blob requests while preserving demand-fetch fallback.
Client and server must both use protocol version 13.

```typescript
const hint = { includeDescendantBlobs: true, maxExtraItems: 256 };
const { events, content } = await session.load(undefined, hint);
// Consume the independent streams; completion of content may mean truncation.
```
