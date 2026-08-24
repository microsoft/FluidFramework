---
"@fluidframework/odsp-driver": minor
"__section": legacy
---
Make point-in-time support optional and consumer-supplied

Point-in-time loading is now an optional implementation supplied by the host. Consumers that do
not enable the feature no longer include its implementation in their dependency graph. Hosts can
control when the feature is loaded by dynamically importing its dedicated entrypoint:

```typescript
const factory = createOdspDocumentServiceFactory({
	getStorageToken,
	getWebsocketToken,
	persistedCache,
	hostPolicy,
	pointInTimeDocumentServiceImplementation: async (props) => {
		const { createPointInTimeDocumentService } = await import(
			"@fluidframework/odsp-driver/legacy/point-in-time"
		);
		return createPointInTimeDocumentService(props);
	},
});
```

The legacy-beta `getOdspPointInTimeDocumentServiceFactory` helper is removed. Bohemia does not
currently use point-in-time loading, so no Bohemia migration is required. Future point-in-time
consumers should use `createOdspDocumentServiceFactory`, which accepts tokens, cache, host policy,
and optional feature implementations in one options object. Existing `OdspDocumentServiceFactory`
and `OdspDocumentServiceFactoryCore` constructor signatures remain unchanged.
