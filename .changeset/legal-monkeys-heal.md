---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Shared branch names

The existing [`createSharedBranch`](https://fluidframework.com/docs/api/tree/itreealpha-interface#createsharedbranch-methodsignature) alpha API now takes an optional `name` string parameter that is associated with the shared branch.
This name can be retrieved by passing the shared branch ID to `getSharedBranchName`.

Note that, unlike the shared branch IDs, shared branch names are not guaranteed to be unique.

#### Compatibility Implications

This change breaks compatibility in the following ways:
- A document written by a client running an earlier FF version cannot be opened by a client running this version.
- A document written by a client running this version cannot be opened by a client running an earlier FF version.
- Clients running earlier FF versions will crash upon receiving ops from clients running this version.
- Clients running this version will crash upon receiving ops from clients running earlier FF versions.

These breaks are only applicable for clients with `enableSharedBranches` turned on. Other clients are unaffected.
