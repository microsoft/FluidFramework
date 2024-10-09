---
"@fluidframework/container-runtime": minor
"@fluid-private/test-end-to-end-tests": minor
---
---
"section": other
---

Behavior Changes to Legacy IContainerRuntimeWithResolveHandle_Deprecated.resolveHandle

This change only affect users of the Legacy and deprecated featured to directly call IContainerRuntimeWithResolveHandle_Deprecated.resolveHandle.

The change is to the default behavior of the wait header, which we are changing from true to false. This means that if a request is made for a datastore
that does not yet exist the response returned will be a 404 error specifying the datastore does not exist:
```
{
  "mimeType": "text/plain",
  "status": 404,
  "value": "not found: <missing id>",
}
```

If this behavior change causes issue contact Fluid to let us know, and the change can be reverted by setting the following config in the provided config provider:
`"Fluid.ContainerRuntime.WaitHeaderDefault": true`
