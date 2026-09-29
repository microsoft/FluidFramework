---
"__section": feature
---

Compose server storage and document session policies independently

Embedded Rust Sea servers now use `BuiltInSeaHost::new(storage, sessions)` instead of separate constructors for each backend and policy combination.
Memory configuration no longer needs a path, and file configuration owns its exact namespace path.
Session decorators compose once per document and share the resulting factory across all sessions and listeners.

```rust
let host = BuiltInSeaHost::new(
    StorageSetup::durable(root.join("documents")),
    SessionSetup::default().decorate(ReaderShedding),
)?;
```

Implement `SessionDecorator` for application-defined session wrappers or a `PolicyFactory` that pauses writers instead of shedding readers.
Decorators receive the document ID and opening-local pressure observations.
Incompatible cache configuration is rejected before storage opens.

This replaces the previous constructor family and `StorageMode` library API.
When migrating file hosts, pass the old root's `documents` subdirectory explicitly.
When migrating `with_storage`, use `StorageSetup::from_storage` and `.with_live_cache(false)` to preserve its previous delivery behavior.
The executable's configuration flags, storage paths, and default policy remain unchanged.
