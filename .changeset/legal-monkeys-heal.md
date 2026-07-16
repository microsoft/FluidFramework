---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Shared branch names

The existing `createSharedBranch` alpha API now takes an optional `name` string parameter that is associated with the shared branch.
This name can be retrieved by passing the shared branch ID to `getSharedBranchName`.

Note that, unlike the shared branch IDs, shared branch names are not guaranteed to be unique.
