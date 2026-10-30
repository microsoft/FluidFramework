---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
---
Add object options to alpha and beta schema factories so defaults can be set once

[SchemaFactoryBeta](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class) and [SchemaFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class) now accept an options object with the scope and a default callback.
Use [objectOptions](https://fluidframework.com/docs/api/fluid-framework/schemafactorybetaoptions-interface#objectoptions-propertysignature) to set defaults instead of repeating the options on each call.
For beta factories, the callback applies to [object](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class#object-method) and [objectRecursive](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class#objectrecursive-method).
For alpha factories, it also applies to [objectAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#objectalpha-method) and [objectRecursiveAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#objectrecursivealpha-method).
It does not change [SchemaFactory](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class) instances.

```typescript
import { SchemaFactoryBeta } from "fluid-framework/beta";

const sf = new SchemaFactoryBeta({
    scope: "com.example",
    objectOptions: (_name, _fields, options) => ({
        allowUnknownOptionalFields: false,
        ...options,
    }),
});

class Foo extends sf.object("Foo", { x: sf.number }) {}
class Bar extends sf.object("Bar", { y: sf.string }) {}

// Override the default for one schema.
class Permissive extends sf.object("Permissive", {}, { allowUnknownOptionalFields: true }) {}
```

New utilities support composing and extending factory settings without losing existing defaults:

- [settings](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class#settings-property) provides the factory's options without its scope.
- [createDerivedFactory](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class#createderivedfactory-method) creates a factory with replacement settings and an optional child scope without changing the original factory.
  It preserves alpha APIs when called on an alpha factory.
- [scopedFactory](https://fluidframework.com/docs/api/fluid-framework/schemafactorybeta-class#scopedfactory-method) creates a child factory that also uses the parent's settings.
- [composeSchemaFactoryBetaOptions](https://fluidframework.com/docs/api/fluid-framework/composeschemafactorybetaoptions-function) applies two callbacks in order.
  The second callback receives the options returned by the first callback.

```typescript
import { composeSchemaFactoryBetaOptions } from "fluid-framework/beta";

const extended = sf.createDerivedFactory(
    composeSchemaFactoryBetaOptions(sf.settings, {
        objectOptions: (_name, _fields, options) => ({
            metadata: { description: "auto-generated" },
            ...options,
        }),
    }),
    "extended",
);
```

For alpha-only options, use [SchemaFactoryAlphaOptions](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalphaoptions-interface), [createDerivedFactory](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#createderivedfactory-method), [scopedFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#scopedfactoryalpha-method), and [composeSchemaFactoryAlphaOptions](https://fluidframework.com/docs/api/fluid-framework/composeschemafactoryalphaoptions-function).
