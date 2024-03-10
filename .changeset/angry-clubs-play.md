---
"@fluidframework/aqueduct": minor
---

aqueduct: Deprecated PureDataObjectFactory.createRootInstance and replaced with PureDataObjectFactory.createInstanceWithDataStore

### Deprecated: PureDataObjectFactory.createRootInstance

This was deprecated because `PureDataObjectFactory.createRootInstance` has an issue at scale.
`PureDataObjectFactory.createRootInstance` used the old method of creating `PureDataObject`s with names. The issue was
that simultaneous creations could happen, and the old api had no good way of dealing with those types of collisions.
This version slightly improved it by resolving those collisions by assuming whatever datastore was created with the
alias or `rootDataStoreId` would just return that datastore. This will work for developers who expect the same type of
`PureDataObject` to be returned from the `createRootInstance` api, but if a potentially different `PureDataObject`
would be returned, then this api would give you the wrong typing.

For a replacement api see `PureDataObjectFactory.createInstanceWithDataStore`.

### New method PureDataObjectFactory.createInstanceWithDataStore

This was done as a replacement of `PureDataObjectFactory.createRootInstance`. This exposes the `IDataStore` interface
in the form of `[PureDataObject, IDataStore]`. `IDataStore` provides the opportunity for developers to use the
`IDataStore.trySetAlias` method. This can return 3 different scenarios `Success`, `Conflict`, or `AlreadyAliased`.
These scenarios can allow the developer to handle conflicts as they wish.
