---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
---

Set object schema defaults once for each factory

[SchemaFactoryAlpha][] now accepts an options object with the scope and default callbacks.
Use `objectOptionDefaults` to set defaults instead of repeating the options on each call.
The callback applies to [objectAlpha][], [objectRecursive][], and [objectRecursiveAlpha][].
It does not change [object][].

```typescript
import { SchemaFactoryAlpha } from "fluid-framework/alpha";

const sf = new SchemaFactoryAlpha({
    scope: "com.example",
    objectOptionDefaults: (_name, _fields, options) => ({
        allowUnknownOptionalFields: true,
        ...options,
    }),
});

class Foo extends sf.objectAlpha("Foo", { x: sf.number }) {}
class Bar extends sf.objectAlpha("Bar", { y: sf.string }) {}

// Override the default for one schema.
class Strict extends sf.objectAlpha("Strict", {}, { allowUnknownOptionalFields: false }) {}
```

[settings][] provides the factory's options without its scope.
[withOptionsAlpha][] creates a factory with the same scope and new settings.
It does not change the original factory.
[scopedFactoryAlpha][] creates a child factory that also uses the parent's settings.
Use [composeSchemaFactoryAlphaOptions][] to apply two callbacks in order.
The second callback receives the options returned by the first callback.

```typescript
import { composeSchemaFactoryAlphaOptions } from "fluid-framework/alpha";

const extended = sf.withOptionsAlpha(
    composeSchemaFactoryAlphaOptions(sf.settings, {
        objectOptionDefaults: (_name, _fields, options) => ({
            metadata: { description: "auto-generated" },
            ...options,
        }),
    }),
);
```

[SchemaFactoryAlpha]: https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class
[objectAlpha]: https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#objectalpha-methodsignature
[objectRecursive]: https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#objectrecursive-methodsignature
[objectRecursiveAlpha]: https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#objectrecursivealpha-methodsignature
[object]: https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#object-methodsignature
[settings]: https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#settings-property
[withOptionsAlpha]: https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#withoptionsalpha-methodsignature
[scopedFactoryAlpha]: https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class#scopedfactoryalpha-methodsignature
[composeSchemaFactoryAlphaOptions]: https://fluidframework.com/docs/api/fluid-framework/composeschemafactoryalphaoptions-function
