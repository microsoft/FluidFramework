---
"@fluidframework/odsp-driver": minor
"__section": feature
---

Add support for setting ProgID when creating ODSP containers

The ODSP create-container request helper now accepts an optional ProgID value and passes it to ODSP when creating the file.
This allows hosts to provide routing metadata for files that share the same extension but should open in different experiences.

#### Usage

```typescript
const request = createOdspCreateContainerRequest(
	siteUrl,
	driveId,
	filePath,
	fileName,
	undefined,
	undefined,
	progId,
);
```
