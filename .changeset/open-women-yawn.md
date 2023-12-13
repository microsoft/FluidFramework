---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/datastore": major
"@fluidframework/runtime-utils": major
---

container-definitions: Fix ISnapshotTreeWithBlobContents and mark internal

`ISnapshotTreeWithBlobContents` is an internal type that should not be used externally. Additionally, the type didn't
match the usage, specifically in runtime-utils where an `any` cast was used to work around undefined blobContents. The
type has been updated to reflect that blobContents can be undefined.
