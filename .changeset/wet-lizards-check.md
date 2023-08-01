---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
---

Request APIs deprecated on ILoader

The `request` API (associated with the `IFluidRouter` interface) has been deprecated on `ILoader` and `Loader`.
Please migrate all usage to using the `IContainer.request(...)` method if using a dynamic request URL, or to the `IContainer.getEntryPoint()` method if trying to obtain the application-specified root object.

**Note:** The `IContainer.request(...)` method will be deprecated in an upcoming release, so do not rely on this method for a long-term solution (the APIs around `entryPoint` and `getEntryPoint()` will become required and available for usage in its place).

After calling `ILoader.resolve(...)`, call the `request(...)` method on the returned `IContainer` with a corresponding request URL. For converting a request URL from `Loader` to `Container`, use the `IUrlResolver` passed into the `Loader`'s constructor.
The following is an example of what this change may look like:

```
// OLD
const request: IRequest;
const urlResolver = new YourUrlResolver();
const loader = new Loader({ urlResolver, ... });

await loader.resolve(request);
const response = loader.request(request);
```

```
// NEW
const request: IRequest;
const urlResolver = new YourUrlResolver();
const loader = new Loader({ urlResolver, ... });

const container = await loader.resolve(request);
const resolvedUrl: IRequest = urlResolver.resolve(request);

// Parse the `resolvedUrl.url` property as necessary before passing to `container.request(...)`
// For an example, see the `Loader.resolveCore(...)` method
const response = container.request(parsedResolvedUrl);
```

Status on removal of the request pattern is tracked in [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
