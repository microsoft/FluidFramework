---
"@fluidframework/container-loader": minor
"__section": deprecation
---
Deprecate `ICreateAndLoadContainerProps` in favor of composable building blocks

`ICreateAndLoadContainerProps` is now `@deprecated`. It remains as a structurally-identical alias and the props types that previously extended it (`ILoadExistingContainerProps`, `ICreateDetachedContainerProps`, `IRehydrateDetachedContainerProps`) now extend the building blocks directly, so no caller migration is required for those.

Callers writing new props types should compose from the building blocks directly:

```ts
import type {
    IContainerHostProps,
    IContainerDriverServices,
} from "@fluidframework/container-loader/legacy";

// Equivalent to the old ICreateAndLoadContainerProps
type MyProps = IContainerHostProps & IContainerDriverServices;

// Add only what you need
interface MyHostOnlyProps extends IContainerHostProps {
    readonly extraOption: boolean;
}
```

- `IContainerHostProps` covers the code loader plus optional policy / observability fields (`options`, `scope`, `logger`, `configProvider`, `protocolHandlerBuilder`, `allowReconnect`, `clientDetailsOverride`).
- `IContainerDriverServices` covers the `urlResolver` + `documentServiceFactory` pair.

`ICreateAndLoadContainerProps` will be removed in a future major release.
