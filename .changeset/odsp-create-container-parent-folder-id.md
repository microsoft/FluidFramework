---
"@fluidframework/odsp-driver": minor
"__section": legacy
---
New containers can be created in a OneDrive or SharePoint folder identified by its item ID

`createOdspCreateContainerRequest` has a new overload that takes an `IOdspCreateContainerRequestOptions` object.
Use it to identify the folder for the new file by its item ID (`parentFolderId`) instead of its path.
Unlike a folder's path, its item ID doesn't change when the folder is renamed or moved.

The existing overload, which takes a folder path, is unchanged.

```typescript
import { createOdspCreateContainerRequest } from "@fluidframework/odsp-driver/legacy";

const request = createOdspCreateContainerRequest({
	siteUrl,
	driveId,
	parentFolderId, // The folder's item ID, not its path
	fileName: "Notes.fluid",
});
await container.attach(request);
```
