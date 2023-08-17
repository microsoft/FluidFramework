# Aliasing and root datastores

## What is a root datastore? What is an aliased datastore?

A root datastore is a datastore which is addressable by a custom identifier (client supplied) and is a direct child of the container runtime. A root datastore will never be garbage collected and it is a singleton with regards to the runtime it belongs to. The concept of a root datastore is considered legacy, mainly due to the previous (deprecated and removed) APIs which referred to such datastores as root. 'Aliased datastore' is the preferred current term to refer to such datastores.

## When to alias datastores?

Alias needs to happen for datastores which:

-   must be referenced by a custom id
-   must never be garbage collected (as they are bound to a custom id which may be stored by the client, they must always be available to be referenced)
-   must be singletons in the container

Creating root datastores was vulnerable to name conflicts, as two clients attempting to create the same root datastore with the same id risks corrupting the document. Aliasing changed the way to achieve the same goal, by enabling an asynchronous 'aliasing' operation on any newly created datastore. So in order to create such a datastore, the client needs to create an anonymous datastore (which will receive a newly generated UUID) and then explicitly attempt to bind it to a custom id (the alias) within a different operation which is decoupled from its creation.

## Aliasing API

The process of aliasing a datastore is split in two parts:

-   Creating a regular datastore using the `IContainerRuntimeBase.createDataStore(pkg: string | string[]): Promise<IDataStore>` function
-   Aliasing the resulting datastore by using the `IDataStore.trySetAlias(alias: string): Promise<AliasResult>` function and specifying a string value to serve as the alias to which the datastore needs to be bound. If successful, `"Success"` will be returned, and a call to `getAliasedDataStoreEntryPoint` with the alias as parameter will return the same datastore's entry point.

The alias API can fail in the following situations, per the `AliasResult` type (see `@fluidframework/runtime-definitions`) type:

-   `"Conflict"` - the alias has already been taken. In this case, the client can call `getAliasedDataStoreEntryPoint` to get the entry point of the datastore already aliased for that value. The current datastore can be left alone unreferenced so it can eventually be garbage collected.
-   `"AlreadyAliased"` - the datastore has already been aliased to a different id.

The alias API is idempotent. Repeatedly calling the trySetAlias function on the same datastore will return Success when the datastore has already been aliased to the same value.

Example:

```typescript
const dataStore = await dataObject.context.containerRuntime.createDataStore("packageName");
// One client will receive "Success", the other client will receive "Conflict".
const aliasResult = await dataStore.trySetAlias("alias");
// Both clients will get the actual aliased datastore. However, the client with the "Conflict" result must fetch the datastore by name
const finalDataStore =
	aliasResult === "Success"
		? dataStore
		: await dataObject.context.containerRuntime.getAliasedDataStoreEntryPoint("alias");
```
