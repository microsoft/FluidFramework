---
"@fluidframework/odsp-driver": minor
"__section": legacy
---
Inject point-in-time support into ODSP document service factories

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

`getOdspPointInTimeDocumentServiceFactory` has been replaced by
`createOdspDocumentServiceFactory`, which accepts tokens, cache, host policy, and optional feature
implementations in one options object. Existing `OdspDocumentServiceFactory` and
`OdspDocumentServiceFactoryCore` constructor signatures remain unchanged.
