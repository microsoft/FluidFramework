---
"@fluidframework/driver-definitions": minor
"fluid-framework": minor
"__section": feature
---
Require the oldest supported client version in ServiceOptions

The alpha [`ServiceOptions.oldestSupportedClient`](https://fluidframework.com/docs/api/driver-definitions/serviceoptions-interface#oldestsupportedclient-propertysignature) property is now required. Code that constructs service options must specify the oldest Fluid Framework client version that can open and process documents written by the service client.

```typescript
const options: ServiceOptions = {
	oldestSupportedClient: "2.100.0",
};
```
