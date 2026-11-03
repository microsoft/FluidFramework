---
"@fluidframework/odsp-driver": minor
"__section": legacy
---
New containers can be created in a OneDrive or SharePoint folder identified by its item ID

The new `createOdspCreateContainerRequestFromOptions` function takes an `OdspCreateContainerRequestOptions` object, which identifies the folder for the new file by either its path (`filePath`) or its item ID (`parentFolderId`).
Unlike a folder's path, its item ID doesn't change when the folder is renamed or moved.

```typescript
import { createOdspCreateContainerRequestFromOptions } from "@fluidframework/odsp-driver/legacy";

const request = createOdspCreateContainerRequestFromOptions({
	siteUrl,
	driveId,
	parentFolderId, // The folder's item ID, not its path
	fileName: "Notes.fluid",
});
await container.attach(request);
```

The existing [`createOdspCreateContainerRequest`](https://fluidframework.com/docs/api/odsp-driver/#createodspcreatecontainerrequest-function) function, which takes a folder path, is unchanged.
