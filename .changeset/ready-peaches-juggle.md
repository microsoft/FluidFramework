---
"@fluidframework/odsp-driver": minor
"__section": feature
---
Enable point-in-time loading on the standard ODSP document service factory

[`OdspDocumentServiceFactoryCore`](https://fluidframework.com/docs/api/odsp-driver/odspdocumentservicefactorycore-class) now exposes the optional now exposes the optional
`createPointInTimeDocumentService` capability. `OdspDocumentServiceFactory` inherits this
capability, so hosts can use the standard factory for both normal and sequence-number-based
document loading. Factories that do not support point-in-time loading leave the capability
undefined.

```typescript
const factory = new OdspDocumentServiceFactory(getStorageToken, getWebsocketToken);

if (factory.createPointInTimeDocumentService !== undefined) {
	const documentService = await factory.createPointInTimeDocumentService(
		resolvedUrl,
		targetSequenceNumber,
	);
}
```
