---
"@fluidframework/container-runtime": minor
"@fluid-private/test-end-to-end-tests": minor
---
---
"section": other
---

Behavior Changes to Legacy IContainerRuntimeWithResolveHandle_Deprecated.resolveHandle

This change only affects users of the Legacy and deprecated feature who directly call IContainerRuntimeWithResolveHandle_Deprecated.resolveHandle.

The default behavior of the wait header is changing from true to false. This means that if a request is made for a datastore that does not yet exist the response returned will be a 404 error specifying the datastore does not exist:
```
{
  "mimeType": "text/plain",
  "status": 404,
  "value": "not found: <missing id>",
}
```

If this behavior change causes issue contact Fluid to let us know. Temporarily the change can be reverted by setting the following config in the provided config provider:
`"Fluid.ContainerRuntime.WaitHeaderDefault": true`
