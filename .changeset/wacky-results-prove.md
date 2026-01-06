---
"fluid-framework": minor
"@fluidframework/map": minor
"__section": breaking
---

directory: Path parameter added to `cleared` event

The `clear` event for SharedDirectory did not include a `path` parameter indicating which directory was cleared. Therefore, the `clear` event is deprecated and will be removed in a future release. Instead use the `cleared` event.

**Before:**
```typescript
sharedDirectory.on("clear", (local, target) => {
    // No way to know which subdirectory was cleared
});
```

**After:**
```typescript
sharedDirectory.on("cleared", (path, local, target) => {
    // path tells you which directory was cleared (e.g., "/", "/subdir1", "/subdir2")
});
```

This change provides better observability by allowing listeners to distinguish between clear operations on different subdirectories within the SharedDirectory hierarchy.
