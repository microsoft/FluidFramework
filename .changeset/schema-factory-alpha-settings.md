---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
---
Configure public schema factories with reusable object defaults

[`SchemaFactory`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class) now accepts an options object with the scope and an [`objectOptions`](https://fluidframework.com/docs/api/fluid-framework/schemafactoryoptions-interface#objectoptions-propertysignature) callback through the public API.
The callback provides reusable defaults for [`object`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#object-method) and [`objectRecursive`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#objectrecursive-method), including the public `allowUnknownOptionalFields` option.
Options passed directly to an object schema remain available to the callback, so applications can choose whether per-schema options or factory defaults take precedence.

```typescript
import { SchemaFactory } from "fluid-framework";

const sf = new SchemaFactory({
	scope: "com.example",
	objectOptions: (_name, _fields, options) => ({
		allowUnknownOptionalFields: true,
		...options,
	}),
});

class Person extends sf.object("Person", { name: sf.string }) {}

// Override the default for one schema.
class StrictPerson extends sf.object(
	"StrictPerson",
	{ name: sf.string },
	{ allowUnknownOptionalFields: false },
) {}
```

New utilities support composing and extending factory settings without losing existing defaults:

- [`settings`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#settings-property) provides the factory's options without its scope.
- [`createDerivedFactory`](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#createderivedfactory-method) creates a factory with replacement settings and an optional child scope without changing the original factory.
- [`composeSchemaFactoryOptions`](https://fluidframework.com/docs/api/fluid-framework/composeschemafactoryoptions-function) applies two callbacks in order.
  The second callback receives the options returned by the first callback.

```typescript
import { composeSchemaFactoryOptions } from "fluid-framework";

const extended = sf.createDerivedFactory(
	composeSchemaFactoryOptions(sf.settings, {
		objectOptions: (_name, _fields, options) => ({
			...options,
			allowUnknownOptionalFields: false,
		}),
	}),
	"strict",
);
```
The beta and alpha schema factories retain their corresponding tier-specific settings and composition APIs.
The beta and alpha schema factories retain their corresponding tier-specific settings and composition APIs.
