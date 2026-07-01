---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add `Component` utilities for composing open-polymorphic schema

A new `@alpha` `Component` namespace is now exported from `@fluidframework/tree` (and re-exported from `fluid-framework`). It provides utilities for composing independently authored application "components" that contribute to a shared configuration, which is useful for implementing ["open polymorphism"](https://en.wikipedia.org/wiki/Polymorphism_(computer_science)) schema patterns where the set of allowed types for a field or collection can be extended by separate libraries.

Each component is expressed as a `Component.Factory`: a function which receives a lazy reference to the composed configuration and returns the content that component contributes. Because the configuration is provided lazily, components may reference (including recursively) types contributed by other components. `Component.composeComponents` combines a set of components into a `Component.ComposedComponents`, from which the aggregated configuration and per-component content can be read.

```typescript
const composed = Component.composeComponents(allComponents, (c) => ({
	allowedItemTypes: c.getComposed("items"),
}));
```

See the worked examples in `openPolymorphism.integration.ts` for end-to-end usage with SharedTree schema.
