---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
---

Add factory-wide schema option defaults to SchemaFactoryAlpha

SchemaFactoryAlpha now accepts an optional settings bag as a second constructor argument.
The `objectOptionDefaults` callback is invoked for every `objectAlpha` call, allowing
defaults such as `allowUnknownOptionalFields` to be set once for the whole factory instead
of repeating them on every call.

```typescript
// Before: options repeated on every call
const sf = new SchemaFactoryAlpha("com.example");
// ...
class Foo extends sf.objectAlpha("Foo", { x: sf.number }, { allowUnknownOptionalFields: true }) {}
class Bar extends sf.objectAlpha("Bar", { y: sf.string }, { allowUnknownOptionalFields: true }) {}

// After: set once on the factory
const sf = new SchemaFactoryAlpha("com.example", {
    objectOptionDefaults: (_name, _fields, options) => ({
        allowUnknownOptionalFields: true,
        ...options, // per-call options still take precedence
    }),
});
// ...
class Foo extends sf.objectAlpha("Foo", { x: sf.number }) {}
class Bar extends sf.objectAlpha("Bar", { y: sf.string }) {}
```

Two new utilities support composing and extending factory settings without losing existing defaults.
`SchemaFactoryAlpha.settings` exposes the options the factory was constructed with.
`SchemaFactoryAlpha.withOptionsAlpha(settings)` creates a new factory with the same scope but replaced settings.
`SchemaFactoryAlpha.scopedFactoryAlpha` now propagates the parent factory's settings to child factories.
`composeSchemaFactoryAlphaOptions(base, override)` chains two sets of options so neither is discarded.

```typescript
// Layer additional defaults onto an existing factory without discarding its settings
const extended = sf.withOptionsAlpha(
    composeSchemaFactoryAlphaOptions(sf.settings, {
        objectOptionDefaults: (_name, _fields, options) => ({
            metadata: { description: "auto-generated" },
            ...options,
        }),
    }),
);
```
