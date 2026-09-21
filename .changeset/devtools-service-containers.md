---
"@fluidframework/devtools-core": minor
"__section": feature
---
Register service client containers directly with Devtools

The new `initializeDevtoolsAlpha` function returns a `FluidDevtoolsAlpha` instance whose `registerContainerDevtools` method accepts a [FluidContainer](https://fluidframework.com/docs/api/driver-definitions/fluidcontainer-interface) created by a [ServiceClient](https://fluidframework.com/docs/api/driver-definitions/serviceclient-interface).
Applications no longer need to access the underlying internal container to register it with Devtools.
The existing beta registration signature for [IContainer](https://fluidframework.com/docs/api/container-definitions/icontainer-interface) is unchanged.
The [ContainerDevtoolsProps](https://fluidframework.com/docs/api/devtools-core/containerdevtoolsprops-interface) input interface is no longer marked `@sealed`, which clarifies that callers can implement this property bag.

```typescript
import { initializeDevtoolsAlpha } from "@fluidframework/devtools-core/alpha";

// `container` is a FluidContainer returned by a ServiceClient.
const devtools = initializeDevtoolsAlpha({});
devtools.registerContainerDevtools({
	container,
	containerKey: "My document",
});
```

To enable data visualization, also provide [containerData](https://fluidframework.com/docs/api/devtools-core/containerdevtoolsprops-interface#containerdata-propertysignature) with the named DDS objects to inspect.
Devtools does not automatically discover DDS objects in the container's application-defined `data`.
