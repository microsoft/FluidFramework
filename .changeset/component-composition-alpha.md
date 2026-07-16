---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add Component utilities for composing open-polymorphic schema

A new `@alpha` `Component` namespace is now exported from `@fluidframework/tree` (and re-exported from `fluid-framework`). It provides utilities for composing independently authored application "components" that contribute to a shared configuration, which is useful for implementing ["open polymorphism"](https://en.wikipedia.org/wiki/Polymorphism_(computer_science)) schema patterns where the set of allowed types for a field or collection can be extended by separate libraries.

Each component is expressed as a `Component.Factory`: a function which receives a lazy reference to the composed configuration and returns the content that component contributes. Because the configuration is provided lazily, components may reference (including recursively) types contributed by other components. `Component.compose` combines a set of components into a `Component.Composed`, from which the aggregated configuration and per-component content can be read.

```typescript
/** Example application component content type. */
interface MyAppComponentContent {
	/**
	 * Item types contributed by this component.
	 * We are just typing them as TreeNodeSchema here to keep things simple.
	 * Real use would often provide some static factory to be able to create instances, as well as some APIs all item nodes should implement.
	 */
	readonly items: Component.LazyArray<TreeNodeSchema>;
}

type MyAppComponent = Component.Factory<MyAppComponentContent>;

// A simple component, which does not depend on any other context.
const textComponent: MyAppComponent = () => ({
	items: () => [() => TextItem],
});

// A component which creates an item type which recursively depends on all item types.
const containerComponent: MyAppComponent = (config) => ({
	items: () => [
		() => class extends sf.array("Container", config().getComposed("items")) {},
	],
});

const appConfig = Component.compose([containerComponent, textComponent]);

// The config's items can now be used to create a TreeViewConfiguration, root schema, or whatever else is needed.
class Root extends sf.object("Root", {
	content: appConfig.getComposed("items"),
}) {}
```

See the worked examples in [openPolymorphism.integration.ts](https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/src/test/openPolymorphism.integration.ts) for end-to-end usage with SharedTree schema.
