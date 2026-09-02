---
"@fluidframework/runtime-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/tree": minor
"@fluidframework/aqueduct": minor
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
to stable 2.x versions and 3.x minor checkpoints whose patch is zero. The deprecated
[`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias)
alias inherits the same restriction and remains available until Client 4.0.

Container runtimes now reject values below `"2.0.0"` and prerelease values. APIs that still
permit the setting to be omitted use `"2.0.0"`, with the same runtime defaults and validation
as explicitly passing `"2.0.0"`.

Before upgrading an application to Client 3.0, upgrade every active deployment that must
collaborate to Fluid Framework 2.0.0 or later. Explicit compatibility settings must use the
canonical property or Azure, ODSP, or Tinylicious service-client argument with a stable 2.x
version or a 3.x minor checkpoint such as `"3.1.0"`:

```typescript
const { container } = await azureClient.getContainer(
	id,
	schema,
	"2.0.0", // oldestSupportedClient
);
```

See [microsoft/FluidFramework#27460](https://github.com/microsoft/FluidFramework/issues/27460)
for migration context.
