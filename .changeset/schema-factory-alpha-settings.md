---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
---
Configure public schema factories with reusable object defaults

[`SchemaFactory`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class) now accepts an options object with the scope and an [`objectOptions`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryoptions-interface#objectoptions-propertysignature) property bag through the public API.
The property bag provides reusable defaults for [`object`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#object-method) and [`objectRecursive`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#objectrecursive-method), including the public `allowUnknownOptionalFields` option.
Options passed directly to an object schema override factory defaults through a shallow merge.

```typescript
import { SchemaFactory } from "fluid-framework";

const sf = new SchemaFactory({
	scope: "com.example",
	objectOptions: {
		allowUnknownOptionalFields: true,
	},
});

class Person extends sf.object("Person", { name: sf.string }) {}

// Override the default for one schema.
class StrictPerson extends sf.object(
	"StrictPerson",
	{ name: sf.string },
	{ allowUnknownOptionalFields: false },
) {}
```

You can read and extend factory settings without changing the original factory:

- [`settings`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#settings-property) provides the factory's options without its scope.
- [`scopedFactory`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#scopedfactory-method) creates a child factory by merging provided object-option properties with the current settings, without changing the original factory.

```typescript
const extended = sf.scopedFactory("strict", {
	objectOptions: {
		allowUnknownOptionalFields: false,
	},
});
```

Passing `{}` or `{ objectOptions: {} }` preserves inherited settings.
Metadata and persisted metadata, when supported, are replaced as whole objects when provided; they are not deep-merged.
To start without inherited settings, construct a new factory with the desired scope.

The beta and alpha schema factories support their corresponding tier-specific options.
