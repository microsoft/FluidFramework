---
"@fluidframework/runtime-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/aqueduct": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/fluid-static": minor
"@fluidframework/azure-client": minor
"@fluidframework/odsp-client": minor
"@fluidframework/tinylicious-client": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/test-utils": minor
"fluid-framework": minor
"__section": breaking
"__highlight": true
---
Require oldest supported clients to use Fluid Framework 2.0 or later

Client 3.0 narrows
[`OldestSupportedClientVersion`](https://fluidframework.com/docs/api/runtime-definitions/oldestsupportedclientversion-typealias)
to supported SemVer values from the 2.x and 3.x release lines. The deprecated
`MinimumVersionForCollab` alias inherits the same restriction and remains
available until Client 4.0.

Container runtimes now reject `oldestSupportedClient` values below `"2.0.0"`.
Before upgrading an application to Client 3.0, upgrade every active deployment
that must collaborate to Fluid Framework 2.0.0 or later. Then configure the
canonical property or service-client argument:

```typescript
const { container } = await azureClient.getContainer(
	id,
	schema,
	"2.0.0", // oldestSupportedClient
);
```

See [microsoft/FluidFramework#27460](https://github.com/microsoft/FluidFramework/issues/27460)
for migration context.
