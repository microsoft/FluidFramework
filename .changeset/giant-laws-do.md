---
"@fluidframework/odsp-driver": minor
"__section": legacy
---
Make point-in-time support optional and consumer-supplied

Point-in-time loading is now an optional implementation supplied by the host. Consumers that do
not enable the feature can tree-shake its implementation from their bundles. Hosts enable the
feature by importing the implementation from the normal legacy beta entrypoint and injecting it:

```typescript
import {
	createOdspDocumentServiceFactory,
	createPointInTimeDocumentService,
} from "@fluidframework/odsp-driver/legacy";

const factory = createOdspDocumentServiceFactory({
	getStorageToken,
	getWebsocketToken,
	persistedCache,
	hostPolicy,
	pointInTimeDocumentServiceImplementation: createPointInTimeDocumentService,
});
```

The legacy-beta `getOdspPointInTimeDocumentServiceFactory` helper is removed. Bohemia does not
currently use point-in-time loading, so no Bohemia migration is required. Future point-in-time
consumers should use `createOdspDocumentServiceFactory`, which accepts tokens, cache, host policy,
and optional feature implementations in one options object. Existing `OdspDocumentServiceFactory`
and `OdspDocumentServiceFactoryCore` constructor signatures remain unchanged.
