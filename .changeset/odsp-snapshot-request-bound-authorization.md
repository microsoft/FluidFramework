---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"__section": fix
---
Add opt-in request-bound authorization for snapshot and ops downloads

Set `HostStoragePolicy.useEffectiveMethodForTokenFetch` to `true` to request authorization for the effective GET method and the full request URL, including `ump=1`.
When the setting is omitted or false, existing hosts continue to receive POST token-callback metadata.
In both modes, snapshot and ops downloads keep multipart POST transport and obtain authorization once per request attempt, including authentication retries.

```typescript
const factory = new OdspDocumentServiceFactory(
	getStorageToken,
	getWebsocketToken,
	persistedCache,
	{ useEffectiveMethodForTokenFetch: true },
);
```

Snapshot prefetch inherits the setting from its supplied document service factory.
Standalone calls can opt in through the trailing `useEffectiveMethodForTokenFetch` parameter of `prefetchLatestSnapshot`.

This correction covers snapshot and ops downloads only; other request paths are unchanged.
Hosts must still provide request-bound authorization through their token-fetching integration.
