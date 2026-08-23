---
"@fluidframework/odsp-driver": minor
"__section": legacy
---
Inject point-in-time support into ODSP document service factories

Point-in-time loading is now an optional implementation supplied by the host. Consumers that do
not enable the feature no longer include its implementation in their dependency graph. Hosts can
control when the feature is loaded by dynamically importing its dedicated entrypoint:

```typescript
const factory = new OdspDocumentServiceFactory(
	getStorageToken,
	getWebsocketToken,
	persistedCache,
	hostPolicy,
	{
		pointInTimeDocumentServiceImplementation: async (props) => {
			const { createPointInTimeDocumentService } = await import(
				"@fluidframework/odsp-driver/legacy/point-in-time"
			);
			return createPointInTimeDocumentService(props);
		},
	},
);
```

`getOdspPointInTimeDocumentServiceFactory` now requires the point-in-time implementation as its
third argument. Import `createPointInTimeDocumentService` from the dedicated entrypoint and pass it
to the helper when eager loading is appropriate.
