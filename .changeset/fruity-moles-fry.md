---
"@fluidframework/container-definitions": major
"@fluidframework/runtime-definitions": major
---

IContainer's and IDataStore's IFluidRouter capabilities are deprecated.

-   The `request` function taking an arbitrary URL and headers is deprecated
-   However, an overload taking only `{ url: "/" }` is not, for back-compat purposes during the migration
    from the request pattern to using entryPoint.

### About requesting "/" and using entryPoint

Requesting "/" is an idiom some consumers of Fluid Framework have used in their own `requestHandler`s
(passed to `ContainerRuntime.loadRuntime` and `FluidDataStoreRuntime`'s constructor).
The ability to access the "root" or "entry point" of a Container / DataStore will presently be provided by
`IContainer.getEntryPoint` and `IDataStore.entryPoint`. However these are still optional, so a temporary workaround is needed.

See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more info on this transition from request to entryPoint.

### Present Replacement for requesting an arbitrary URL

Suppose you have these variables:

```ts
const container: IContainer = ...;
const dataStore: IDataStore = ...;
```

Before:

```ts
container.request({ url, headers });
dataStore.request({ url, headers });
```

After:

```ts
// Assume there is an interface like this in the app's Container implementation
interface CustomUrlRouter {
	doRequestRouting(request: { url: string; headers: Record<string, any>; }): any;
}

// Prerequisite: Pass a requestHandler to ContainerRuntime.loadRuntime that routes "/"
// to some root object implementing CustomUrlRouter
const containerRouter: CustomUrlRouter = await container.request({ "/" });
containerRouter.doRequestRouting({ url, headers });

// Prerequisite: Pass a requestHandler to FluidDataStoreRuntime's constructor that routes "/"
// to some root object implementing CustomUrlRouter
const dataStoreRouter: CustomUrlRouter = await dataStore.request({ "/" });
dataStoreRouter.doRequestRouting({ url, headers });
```

### Looking ahead to using entryPoint

In the next major release, `getEntryPoint` and `entryPoint` should be mandatory and available for use.
Then you may replace each call `request({ url: "/" })` with a call to get the entryPoint using these functions/properties.
