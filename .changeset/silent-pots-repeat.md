---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Bug fix: commit metadata access after history trimming

Before this change, accessing the properties on a `TreeBranchCommitMetadata` object could throw an error with any the following error codes: `0xa5e`, `0xa5f`, `0xa60`, `0xd36`.
This would happen when the access was made after the corresponding commit was trimmed from history:

```typescript
const commitMetadata = view.branchHistory.getHead();

// ...History trimming occurs...

// Would assert:
console.log(commitMetadata.revision);
```

The properties now remain safe to access after the corresponding commit is trimmed from history.
