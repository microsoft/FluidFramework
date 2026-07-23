/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { Tree } from "../shared-tree/index.js";
import {
	allowUnused,
	evaluateLazySchema,
	SchemaFactory,
	TreeBeta,
	TreeViewConfiguration,
	type NodeKind,
	type ObjectFromSchemaRecord,
	type TreeNode,
	type TreeNodeSchema,
	type Unhydrated,
} from "../simple-tree/index.js";
import type { requireAssignableTo } from "../util/index.js";
import { Component } from "../componentApi.js";

/**
 * Examples and tests for open polymorphism design patterns for schema.
 * @remarks
 * Open polymorphism means polymorphism (where a value has one of multiple types) where the set of allowed types can be extended arbitrarily.
 * This is the same idea behind TypeScript interfaces, but for {@link TreeNodeSchema}.
 *
 * Contrast this with "closed" polymorphism, where the set of allowed types is fixed and cannot be extended.
 * Closed polymorphism in TypeScript can be expressed with {@link https://en.wikipedia.org/wiki/Union_type|union types}.
 * In tree schema, closed polymorphism is expressed with {@link AllowedTypes}.
 *
 * Tree's stored schema do not support open polymorphism: all possible implementations must be explicitly listed.
 * View schema however can emulate it by carefully controlling evaluation order:
 * the source code can be structured in an open polymorphism style which at runtime evaluate into closed polymorphism by having each implementation register itself into a central {@link AllowedTypes}.
 * There are a few ways to do this, some of which are demonstrated below.
 * Of particular note is the {@link Component} design pattern, which leverages utilities in the {@link Component} namespace.
 */

/**
 * Schema factory these tests.
 */
const sf = new SchemaFactory("test");

/**
 * Schema used in example.
 */
class Point extends sf.object("Point", { x: sf.number, y: sf.number }) {}

// #region Example definition of a polymorphic Component named "Item"
// This code defines what an Item is and how to implement it, but does not depend on any of the implementations.
// Instead implementations depend on this, inverting the normal dependency direction for schema.

/**
 * Fields all Items must have.
 */
const itemFields = { location: Point };

/**
 * Properties all item types must implement.
 */
interface ItemExtensions {
	foo(): void;
}

/**
 * An Item node.
 * @remarks
 * Open polymorphic collection which libraries can provide additional implementations of, similar to TypeScript interfaces.
 * Implementations should declare schemas whose nodes extend this interface, and have the schemas statically implement ItemSchema.
 */
type Item = TreeNode & ItemExtensions & ObjectFromSchemaRecord<typeof itemFields>;

/**
 * Details about the type all item schema must provide.
 * @remarks
 * This pattern can be used for things like generating insert content menus which can describe and create any of the allowed child types.
 */
interface ItemStatic {
	readonly description: string;
	default(): Unhydrated<Item>;
}

/**
 * A schema for an Item.
 */
type ItemSchema = TreeNodeSchema<string, NodeKind.Object, Item> & ItemStatic;

// #endregion

/**
 * Example implementation of an Item.
 */
class TextItem
	extends sf.object("TextItem", { ...itemFields, text: sf.string })
	implements Item
{
	public static readonly description = "Text";
	public static default(): TextItem {
		return new TextItem({ text: "", location: { x: 0, y: 0 } });
	}

	public foo(): void {
		this.text += "foo";
	}
}

describe("Open Polymorphism design pattern examples and tests for them", () => {
	// A simple pattern for doing open polymorphism with a mutable static registry.
	// Currently, allowed type arrays are processed eagerly, making this pattern no longer work,
	// but it serves as a simplified example of what the other patterns here are implementing.
	describe("mutable static registry", () => {
		// See note on describe block for why this is skipped.
		it.skip("without customizeSchemaTyping", () => {
			// -------------
			// Registry for items. If using this pattern, this would typically be defined alongside the Item interface.

			/**
			 * Item type registry.
			 * @remarks
			 * This doesn't have to be a mutable static.
			 * For example libraries could export their implementations instead of adding them when imported,
			 * then the top level code which pulls in all the libraries could aggregate the item types.
			 *
			 * TODO: document (and enforce/detect) when how late it is safe to modify array's used as allowed types.
			 * These docs should ideally align with how late lazy type lambdas are evaluated (when the tree configuration is constructed, or an instance is made, which ever is first? Maybe define schema finalization?)
			 */
			const ItemTypes: ItemSchema[] = [];

			// -------------
			// Library using an Item

			class Container extends sf.array("Container", ItemTypes) {}

			// -------------
			// Library defining an item

			ItemTypes.push(TextItem);

			// -------------
			// Example use of container with generic code and down casting

			const container = new Container();

			// If we don't do anything special, the insertable type is never, so a cast is required to insert content.
			// See example using customizeSchemaTyping for how to avoid this.
			// TODO: See `SchemaUnionToIntersection` test for why `as never` is currently not required here.
			container.insertAtStart(new TextItem({ text: "", location: { x: 0, y: 0 } }));

			type Input = Parameters<typeof container.insertAtStart>[0];
			allowUnused<requireAssignableTo<Input, never>>();

			// Items read from the container are typed as Item and have the expected APIs:
			const first = container[0];
			first.foo();
			first.location.x += 1;

			// Down casting works as normal.
			if (Tree.is(first, TextItem)) {
				assert.equal(first.text, "foo");
			}
		});

		it("error cases", () => {
			const ItemTypes: ItemSchema[] = [];
			class Container extends sf.array("Container", ItemTypes) {}

			// Not added to registry
			// ItemTypes.push(TextItem);

			const container = new Container();

			// Should error due to out of schema content
			assert.throws(
				() =>
					container.insertAtStart(
						new TextItem({ text: "", location: { x: 0, y: 0 } }) as never,
					),
				validateUsageError(/schema/),
			);

			// Modifying registration too late should error
			assert.throws(() => ItemTypes.push(TextItem));
		});

		// See note on describe block for why this is skipped.
		it.skip("recursive case", () => {
			const ItemTypes: ItemSchema[] = [];

			// Example recursive item implementation
			class Container extends sf.array("Container", ItemTypes) {}
			class ContainerItem extends sf.object("ContainerItem", {
				...itemFields,
				container: Container,
			}) {
				public static readonly description = "Container";
				public static default(): ContainerItem {
					return new ContainerItem({ container: [], location: { x: 0, y: 0 } });
				}

				public foo(): void {}
			}

			ItemTypes.push(ContainerItem);

			const container = new Container();

			container.insertAtStart(
				new ContainerItem({ container: [], location: { x: 0, y: 0 } }) as never,
			);
		});
	});

	// Example component design pattern which avoids the mutable static registry and instead composes declarative components.
	// This doesn't rely on any "components" framework, and rather just implements the minimal subset it needs inline.
	it("components", () => {
		/**
		 * Example application component interface.
		 */
		interface MyAppComponent {
			itemTypes(lazyConfig: () => MyAppConfig): LazyItems;
		}

		type LazyItems = readonly (() => ItemSchema)[];

		function composeComponents(allComponents: readonly MyAppComponent[]): MyAppConfig {
			const lazyConfig = () => config;
			const ItemTypes = allComponents.flatMap(
				(component): LazyItems => component.itemTypes(lazyConfig),
			);

			const config: MyAppConfig = { ItemTypes };

			return config;
		}

		interface MyAppConfig {
			readonly ItemTypes: LazyItems;
		}

		function createContainer(config: MyAppConfig): ItemSchema {
			class Container extends sf.array("Container", config.ItemTypes) {}
			class ContainerItem extends sf.object("ContainerItem", {
				...itemFields,
				container: Container,
			}) {
				public static readonly description = "Container";
				public static default(): ContainerItem {
					return new ContainerItem({ container: [], location: { x: 0, y: 0 } });
				}

				public foo(): void {}
			}

			return ContainerItem;
		}

		const containerComponent: MyAppComponent = {
			itemTypes(lazyConfig: () => MyAppConfig): LazyItems {
				return [() => createContainer(lazyConfig())];
			},
		};

		const textComponent: MyAppComponent = {
			itemTypes(): LazyItems {
				return [() => TextItem];
			},
		};

		const appConfig = composeComponents([containerComponent, textComponent]);

		const treeConfig = new TreeViewConfiguration({
			schema: appConfig.ItemTypes,
			enableSchemaValidation: true,
			preventAmbiguity: true,
		});
	});

	// Example using the simplified/minimal `ComponentMinimal` library below.
	// Same as the above, but with some reusable logic factored out.
	it("ComponentMinimal library", () => {
		/**
		 * Example application component interface.
		 */
		type MyAppComponent = ComponentMinimal.ComponentSchemaCollection<
			MyAppConfigPartial,
			ItemSchema
		>;

		function createContainer(config: MyAppConfigPartial): ItemSchema {
			class Container extends sf.array("Container", config.allowedItemTypes) {}
			class ContainerItem extends sf.object("ContainerItem", {
				...itemFields,
				container: Container,
			}) {
				public static readonly description = "Container";
				public static default(): ContainerItem {
					return new ContainerItem({ container: [], location: { x: 0, y: 0 } });
				}

				public foo(): void {}
			}

			return ContainerItem;
		}

		// An example component which recursively depends on all components.
		const containerComponent: MyAppComponent = (lazyConfig) => [
			() => createContainer(lazyConfig()),
		];

		const textComponent: MyAppComponent = () => [() => TextItem];

		/**
		 * Subset of `MyAppConfig` which is available while composing components.
		 */
		interface MyAppConfigPartial {
			/**
			 * {@link AllowedTypes} containing all ItemSchema contributed by components.
			 */
			readonly allowedItemTypes: ComponentMinimal.LazyArray<ItemSchema>;
		}

		/**
		 * Example configuration type for an application.
		 *
		 * Contains a collection of schema to demonstrate how ComponentSchemaCollection works for schema dependency inversions.
		 */
		interface MyAppConfig extends MyAppConfigPartial {
			/**
			 * Set of all ItemSchema contributed by components.
			 * @remarks
			 * Same content as {@link MyAppConfig.allowedItemTypes}, but normalized into a Set.
			 *
			 * This is included to demonstrate how and where to use evaluated schema.
			 */
			readonly items: ReadonlySet<ItemSchema>;
		}

		/**
		 * The application specific compose logic.
		 *
		 * Information from the components can be aggregated into the configuration.
		 */
		function composeComponents(allComponents: readonly MyAppComponent[]): MyAppConfig {
			const lazyConfig: () => MyAppConfigPartial = () => config;
			// Compose all components
			const ItemTypes = ComponentMinimal.composeComponentSchema(allComponents, lazyConfig);
			const config: MyAppConfigPartial = { allowedItemTypes: ItemTypes };
			// At this point it is now legal to evaluate lazy schema:
			const items = new Set(ItemTypes.map(evaluateLazySchema));
			return { ...config, items };
		}

		const appConfig = composeComponents([containerComponent, textComponent]);

		// Export the tree config appropriate for this schema.
		// This is passed into the SharedTree when it is initialized.
		// This eagerly evaluates the schema, so anything that used by these schema must be defined before this point.
		const treeConfig = new TreeViewConfiguration(
			// Schema for the root
			{ schema: appConfig.allowedItemTypes },
		);
	});

	// Examples using the package exported `Component` library.
	describe("Component library", () => {
		// Same as the above, but using the `Component` library
		// This has minimal changes from the above example to keep it well aligned with the others,
		// and thus isn't necessarily the cleanest example of use of the `Component` library.
		// There are more dedicated examples of the `Component` library below, as well as in its own test suite.
		it("Example", () => {
			/**
			 * Example application component interface.
			 */
			type MyAppComponent = Component.Factory<MyAppConfigPartial, MyAppConfigPartial>;

			function createContainer(config: MyAppConfigPartial): ItemSchema {
				class Container extends sf.array("Container", config.allowedItemTypes()) {}
				class ContainerItem extends sf.object("ContainerItem", {
					...itemFields,
					container: Container,
				}) {
					public static readonly description = "Container";
					public static default(): ContainerItem {
						return new ContainerItem({ container: [], location: { x: 0, y: 0 } });
					}

					public foo(): void {}
				}

				return ContainerItem;
			}

			// An example component which recursively depends on all components.
			const containerComponent: MyAppComponent = (lazyConfig) => ({
				allowedItemTypes: () => [() => createContainer(lazyConfig())],
			});

			const textComponent: MyAppComponent = () => ({
				allowedItemTypes: () => [() => TextItem],
			});

			/**
			 * Subset of `MyAppConfig` which is available while composing components.
			 * Also used as content type for the component factories in this example.
			 */
			interface MyAppConfigPartial {
				/**
				 * {@link AllowedTypes} containing all ItemSchema contributed by components.
				 */
				readonly allowedItemTypes: Component.LazyArray<ItemSchema>;
			}

			/**
			 * Example configuration type for an application.
			 *
			 * Contains a collection of schema to demonstrate how ComponentSchemaCollection works for schema dependency inversions.
			 */
			interface MyAppConfig extends MyAppConfigPartial {
				/**
				 * Set of all ItemSchema contributed by components.
				 * @remarks
				 * Same content as {@link MyAppConfig.allowedItemTypes}, but normalized into a Set.
				 *
				 * This is included to demonstrate how and where to use evaluated schema.
				 */
				readonly items: ReadonlySet<ItemSchema>;
			}

			/**
			 * The application specific compose logic.
			 *
			 * Information from the components can be aggregated into the configuration.
			 */
			function composeComponents(allComponents: readonly MyAppComponent[]): MyAppConfig {
				// Compose all components
				const composed = Component.compose(
					allComponents,
					(lazyConfig): MyAppConfigPartial => ({
						allowedItemTypes: () => lazyConfig.getComposed("allowedItemTypes"),
					}),
				);
				const config: MyAppConfigPartial = composed.config;
				const ItemTypes = composed.config.allowedItemTypes();
				// At this point it is now legal to evaluate lazy schema:
				// This is equivalent to normalizeAllowedTypes(ItemTypes).evaluateSet(), but preserves more type information.
				const items = new Set(ItemTypes.map(evaluateLazySchema));
				return { ...config, items };
			}

			const appConfig = composeComponents([containerComponent, textComponent]);

			// Export the tree config appropriate for this schema.
			// This is passed into the SharedTree when it is initialized.
			// This eagerly evaluates the schema, so anything that used by these schema must be defined before this point.
			const treeConfig = new TreeViewConfiguration(
				// Schema for the root
				{ schema: appConfig.allowedItemTypes() },
			);
		});

		// Same as the above, but using the default composition.
		// Also adds an example of using `getComponent` to retrieve the final version of a component from the composed configuration.
		it("Example2", () => {
			/** Example application component interface. */
			interface MyAppComponent {
				/** {@link AllowedTypes} provider containing all ItemSchema contributed by components. */
				readonly items: Component.LazyArray<ItemSchema>;
			}

			/** Helper for containerComponent to create the schema as a function of the composed configuration. */
			function createContainer(config: Component.Composed<MyAppComponent>) {
				class ContainerArray extends sf.array("Container", config.getComposed("items")) {}
				class ContainerItem extends sf.object("ContainerItem", {
					...itemFields,
					container: ContainerArray,
				}) {
					public static readonly description = "Container";
					public static default(): ContainerItem {
						return new ContainerItem({ container: [], location: { x: 0, y: 0 } });
					}

					public foo(): void {}
				}

				return ContainerItem;
			}

			// An example component which recursively depends on all components.
			const containerComponent = ((lazyConfig) => {
				const containerSchema = Component.memoize(() => createContainer(lazyConfig()));
				return {
					items: () => [containerSchema],
					containerSchema,
				};
				// Note the typing using `satisfies` so we get type checking while still allowing `Component.Composed.getComponent` to access the more specific type with the `containerSchema` member.
			}) satisfies Component.Factory<MyAppComponent>;

			// An example component which contributes a text item type.
			const textComponent = (() => ({
				items: () => [() => TextItem],
			})) satisfies Component.Factory<MyAppComponent>;

			const appConfig = Component.compose([containerComponent, textComponent]);

			// Export the tree config appropriate for this schema.
			// This is passed into the SharedTree when it is initialized.
			// This eagerly evaluates the schema, so anything that used by these schema must be defined before this point.
			const treeConfig = new TreeViewConfiguration(
				// Schema for the root
				{ schema: appConfig.getComposed("items") },
			);

			// The final version of any component (with component specific strong typing) can be obtained from the composed configuration, and used as needed.
			const Container = appConfig.getComponent(containerComponent).containerSchema();
			const containerNode = new Container({
				location: { x: 0, y: 0 },
				container: [TextItem.default()],
			});
		});

		// An open polymorphic collection of schema with implementations provided by components.
		// Unlike the above examples, this one doesn't require the schema to implement any specific interfaces, making it simpler and more self contained, but less realistic.
		it("minimal open polymorphism", () => {
			/** Example application component content type. */
			interface MyAppComponentContent {
				/**
				 * Item types contributed by this component.
				 * We are just typing them as TreeNodeSchema here to keep things simple.
				 * Real use would often provide some static factory to be able to create instances, as well as some APIs all item nodes should implement.
				 */
				readonly items: Component.LazyArray<TreeNodeSchema>;
			}

			// To keep this example simple, we let the configuration passed into the component factories
			// default to the composition itself (`Composed`).
			// There are a lot of customization options for this, but this example is simply avoiding all of them.
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

			// As noted above, we are not customizing the config, so the builder is omitted.
			const appConfig = Component.compose([containerComponent, textComponent]);

			// The config's items can now be used to create a TreeViewConfiguration, root schema, or whatever else is needed.
			class Root extends sf.object("Root", {
				content: appConfig.getComposed("items"),
			}) {}

			// The schema can be used like any other, but it lacks full compile time knowledge of the allowed types,
			// so some casts are required to create or insert values in some cases.
			const root = new Root({
				// We have no compile time information about what node types are legal here,
				// so the strict typing for insertable content is `never`.
				// Runtime checks are robust so we can cast here and rely on them.
				content: new TextItem({ text: "x", location: { x: 0, y: 0 } }) as never,
			});
			// Reading content is type safe, but type is not very specific in this example.
			const child = root.content;
			assert(Tree.is(child, TextItem));
			assert.equal(child.text, "x");
		});

		it("minimal open polymorphism with `getComponent`", () => {
			interface MyAppComponentContent {
				readonly items: Component.LazyArray<TreeNodeSchema>;
			}

			type Composed = Component.Composed<MyAppComponentContent>;

			// A component with a more specific type, exposing its `container` property so it can be queried for after composition.
			const containerComponent = (config: () => Composed) => {
				const container = Component.memoize(
					() => class extends sf.array("Container", config().getComposed("items")) {},
				);
				return {
					container,
					items: () => [container],
				} satisfies MyAppComponentContent & { container: unknown };
			};

			const appConfig = Component.compose([containerComponent], (config) => config);

			const Container = appConfig.getComponent(containerComponent).container();
			const node = new Container();
			// We have no compile time information about what node types are legal here (so the cast is needed), but it is runtime checked.
			node.insertAtStart(new Container() as never);
		});

		it("minimal open polymorphism with static factory", () => {
			interface MyAppComponentContent {
				// Here we add in some requirements for the items to provide static descriptions and a default value factory.
				// This could be used to generate a menu of item types to insert.
				readonly items: Component.LazyArray<TreeNodeSchema & MyStatics>;
			}
			interface MyStatics {
				readonly description: string;
				// Real use would often want to further constrain this return type.
				default(): Unhydrated<TreeNode>;
			}

			type MyAppComponent = Component.Factory<MyAppComponentContent>;

			// A simple item type, with the required statics.
			class MyItem extends sf.object("MyItem", {}) {
				public static readonly description = "A stateless placeholder item";
				public static default(): MyItem {
					return new MyItem({});
				}
			}
			const myComponent: MyAppComponent = () => ({
				items: () => [() => MyItem],
			});

			// Another component
			const textComponent: MyAppComponent = () => ({
				items: () => [() => TextItem],
			});

			const appConfig = Component.compose([myComponent, textComponent]);

			// We could use this config to build a menu showing the description of each and let a user select one of the available item types to insert.
			const menu = appConfig.getComposed("items").map((lazy) => lazy());
			// Suppose they select the first item, we can create an instance like this:
			const item = menu[0].default();
		});

		// A more complex example showing some challenging edge cases.
		// Includes:
		// - A component with a schema in multiple open polymorphic collections.
		// - Access to exports from components which depend on the injected set of components.
		it("Component library edge cases", () => {
			/**
			 * Example application component interface.
			 */
			interface MyAppComponentContent {
				/**
				 * Item types contributed by this component.
				 */
				items?: Component.LazyArray<ItemSchema>;
				/**
				 * Background types contributed by this component.
				 */
				backgrounds?: Component.LazyArray<BackgroundSchema>;
			}

			type MyAppComponent = Component.Factory<MyAppComponentContent, MyAppConfigPartial>;

			interface BackgroundExtensions {
				html(): string;
			}
			type Background = TreeNode & BackgroundExtensions;
			interface BackgroundStatic {
				readonly description: string;
				default(): Unhydrated<Background>;
			}
			type BackgroundSchema = TreeNodeSchema<string, NodeKind.Object, Background> &
				BackgroundStatic;

			// An example component which recursively depends on all components.
			const containerComponent: MyAppComponent = (lazyConfig) => {
				function createContainer(config: MyAppConfigPartial): ItemSchema {
					class Container extends sf.array("Container", config.allowedItemTypes) {}
					class ContainerItem extends sf.object("ContainerItem", {
						...itemFields,
						container: Container,
					}) {
						public static readonly description = "Container";
						public static default(): ContainerItem {
							return new ContainerItem({ container: [], location: { x: 0, y: 0 } });
						}

						public foo(): void {}
					}

					return ContainerItem;
				}

				return {
					items: () => [() => createContainer(lazyConfig())],
				};
			};

			const textComponent: MyAppComponent = () => ({
				items: () => [() => TextItem],
			});

			class Color
				extends sf.object("Color", { r: sf.number, g: sf.number, b: sf.number })
				implements Background
			{
				public html(): string {
					return `rgb(${this.r}, ${this.g}, ${this.b})`;
				}
				public static readonly description = "Color Background";
				public static default(): Color {
					return new Color({ r: 0, g: 0, b: 0 });
				}
			}
			const colorsComponent: MyAppComponent = () => ({
				backgrounds: () => [() => Color],
			});

			// Example component showing how a single schema can be shared between multiple open polymorphic collections.
			// Also shows how a component can export a lazy schema reference.
			const comboComponent = ((lazyConfig: () => MyAppConfigPartial) => {
				const blank = () => {
					// This could use config if needed.
					const config = lazyConfig();

					class Blank
						extends sf.object("Blank", { ...itemFields })
						implements Background, Item
					{
						public html(): string {
							return "transparent";
						}
						public static readonly description = "Blank";
						public static default(): Blank {
							return new Blank({ location: { x: 0, y: 0 } });
						}
						public foo(): void {}
					}
					return Blank;
				};
				return {
					items: () => [blank],
					backgrounds: () => [blank],
					// This is not required, but shows that components can also export evaluated content if needed.
					blank,
				};
			}) satisfies MyAppComponent;

			/**
			 * Subset of `MyAppConfig` which is available while composing components.
			 */
			interface MyAppConfigPartial {
				/**
				 * {@link AllowedTypes} containing all ItemSchema contributed by components.
				 */
				readonly allowedItemTypes: readonly (() => ItemSchema)[];
				readonly allowedBackgroundTypes: readonly (() => BackgroundSchema)[];
			}

			/**
			 * Example configuration type for an application.
			 *
			 * Contains a collection of schema to demonstrate how ComponentSchemaCollection works for schema dependency inversions.
			 */
			interface MyAppConfig extends MyAppConfigPartial {
				/**
				 * Set of all ItemSchema contributed by components.
				 * @remarks
				 * Same content as {@link MyAppConfig.allowedItemTypes}, but normalized into a Set.
				 *
				 * This is included to demonstrate how and where to use evaluated schema.
				 */
				readonly items: ReadonlySet<ItemSchema>;
				readonly backgrounds: ReadonlySet<BackgroundSchema>;
				readonly composed: Component.Composed<MyAppComponentContent, MyAppConfigPartial>;
			}

			/**
			 * The application specific compose logic.
			 *
			 * Information from the components can be aggregated into the configuration.
			 */
			function composeComponents(allComponents: readonly MyAppComponent[]): MyAppConfig {
				const composed = Component.compose(allComponents, (c) => {
					const config: MyAppConfigPartial = {
						allowedItemTypes: c.getComposed("items"),
						allowedBackgroundTypes: c.getComposed("backgrounds"),
					};
					return config;
				});

				// At this point it is now legal to evaluate lazy schema:
				const items = new Set(composed.config.allowedItemTypes.map(evaluateLazySchema));
				const backgrounds = new Set(
					composed.config.allowedBackgroundTypes.map(evaluateLazySchema),
				);
				return { composed, ...composed.config, items, backgrounds };
			}

			const appConfig = composeComponents([
				containerComponent,
				textComponent,
				colorsComponent,
				comboComponent,
			]);

			class Root extends sf.object("Root", {
				content: appConfig.allowedItemTypes,
				backgrounds: appConfig.allowedBackgroundTypes,
			}) {}

			// Export the tree config appropriate for this schema.
			// This is passed into the SharedTree when it is initialized.
			// This eagerly evaluates the schema, so anything that used by these schema must be defined before this point.
			const treeConfig = new TreeViewConfiguration({ schema: Root });

			const blankNode = TreeBeta.create(
				// Example for how to access content from a components which might depend on the full set of composed components.
				[appConfig.composed.getComponent(comboComponent).blank],
				{ location: { x: 0, y: 0 } },
			);
		});
	});
});

/**
 * Utilities for helping implement various application component design patterns.
 */
export namespace ComponentMinimal {
	/**
	 * Function which takes in a lazy configuration and returns a collection of schema types.
	 * @remarks
	 * This allows the schema to reference items from the configuration, which could include themselves recursively.
	 */
	export type ComponentSchemaCollection<TConfig, TSchema> = (
		lazyConfiguration: () => TConfig,
	) => LazyArray<TSchema>;

	/**
	 * {@link AllowedTypes} where all of the allowed types' schema implement `T` and are lazy.
	 */
	export type LazyArray<T> = readonly (() => T)[];

	/**
	 * Combine multiple {@link ComponentMinimal.ComponentSchemaCollection}s into a single {@link AllowedTypes} array.
	 */
	export function composeComponentSchema<TConfig, TItem>(
		allComponents: readonly ComponentSchemaCollection<TConfig, TItem>[],
		lazyConfiguration: () => TConfig,
	): (() => TItem)[] {
		const itemTypes = allComponents.flatMap(
			(component): LazyArray<TItem> => component(lazyConfiguration),
		);
		return itemTypes;
	}
}
