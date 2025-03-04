/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	TreeViewConfiguration,
	type NodeKind,
	type ObjectFromSchemaRecord,
	type TreeNode,
	type TreeNodeSchema,
	type Unhydrated,
} from "../simple-tree/index.js";
import { Tree } from "../shared-tree/index.js";
import { validateUsageError } from "./utils.js";
import { customizeSchemaTyping } from "../simple-tree/index.js";

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
 * Implementations should declare schema who's nodes extends this interface, and have the schema statically implement ItemSchema.
 */
type Item = TreeNode & ItemExtensions & ObjectFromSchemaRecord<typeof itemFields>;

/**
 * Details about the type all item schema must provide.
 * @remarks
 * This pattern can be used for for things like generating insert content menus which can describe and create any of the allowed child types.
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
	describe("mutable static registry", () => {
		it("without customizeSchemaTyping", () => {
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
			container.insertAtStart(new TextItem({ text: "", location: { x: 0, y: 0 } }) as never);

			// Items read from the container are typed as Item and have thew expected APIs:
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

		it("recursive case", () => {
			const ItemTypes: ItemSchema[] = [];

			// Example recursive item implementation
			class Container extends sf.array("Container", ItemTypes) {}
			class ContainerItem extends sf.object("ContainerItem", {
				...itemFields,
				container: Container,
			}) {
				public static readonly description = "Text";
				public static default(): TextItem {
					return new TextItem({ text: "", location: { x: 0, y: 0 } });
				}

				public foo(): void {}
			}

			ItemTypes.push(ContainerItem);

			const container = new Container();

			container.insertAtStart(
				new ContainerItem({ container: [], location: { x: 0, y: 0 } }) as never,
			);
		});

		it("safer editing API with customizeSchemaTyping", () => {
			const ItemTypes: ItemSchema[] = [];
			class Container extends sf.object("Container", {
				// Here we force the insertable type to be `Item`, allowing for a potentially unsafe (runtime checked against the schema registrations) insertion of any Item type.
				// This avoids the issue from the first example where the insertable type is `never`.
				child: sf.optional(customizeSchemaTyping(ItemTypes).simplified<Item>()),
			}) {}

			ItemTypes.push(TextItem);

			const container = new Container({ child: undefined });
			const container2 = new Container({ child: TextItem.default() });

			// Enabled by customizeSchemaTyping
			container.child = TextItem.default();
			container.child = undefined;

			// Allowed at compile time, but not allowed by schema:
			class DisallowedItem
				extends sf.object("DisallowedItem", { ...itemFields })
				implements Item
			{
				public foo(): void {}
			}

			// Invalid TreeNodes are rejected at runtime even if allowed at compile time:
			assert.throws(
				() => {
					container.child = new DisallowedItem({ location: { x: 0, y: 0 } });
				},
				validateUsageError(/Invalid schema/),
			);

			// Invalid insertable content is rejected.
			// Different use of customizeSchemaTyping could have allowed this at compile time by not including TreeNode in Item.
			assert.throws(
				() => {
					// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
					container.child = {} as Item;
				},
				validateUsageError(/incompatible with all of the types allowed by the schema/),
			);
		});

		// Example component design pattern which avoids the mutable static registry and instead composes declarative components.
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
				const uncachedItemTypes: LazyItems = allComponents.flatMap(
					(component): LazyItems => component.itemTypes(lazyConfig),
				);

				const ItemTypes = uncachedItemTypes.map((uncached) => {
					let cache: ItemSchema | undefined;
					return () => {
						cache ??= uncached();
						return cache;
					};
				});
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
					public static readonly description = "Text";
					public static default(): TextItem {
						return new TextItem({ text: "", location: { x: 0, y: 0 } });
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

		it("generic components system", () => {
			/**
			 * Function which takes in a lazy configuration and returns a collection of schema types.
			 * @remarks
			 * This allows the schema to reference items from the configuration, which could include themselves recursively.
			 */
			type ComponentSchemaCollection<TConfig, TSchema> = (
				lazyConfig: () => TConfig,
			) => LazyArray<TSchema>;

			type LazyArray<T> = readonly (() => T)[];

			function composeComponentSchema<TConfig, TItem>(
				allComponents: readonly ComponentSchemaCollection<TConfig, TItem>[],
				lazyConfig: () => TConfig,
			): (() => TItem)[] {
				const uncashedItemTypes: LazyArray<TItem> = allComponents.flatMap(
					(component): LazyArray<TItem> => component(lazyConfig),
				);

				const ItemTypes = uncashedItemTypes.map((uncached) => {
					let cache: TItem | undefined;
					return () => {
						cache ??= uncached();
						return cache;
					};
				});

				return ItemTypes;
			}

			// App specific //

			/**
			 * Example configuration type for an application.
			 *
			 * Contains a collection of schema to demonstrate how ComponentSchemaCollection works for schema dependency inversions.
			 */
			interface MyAppConfig {
				readonly ItemTypes: LazyArray<ItemSchema>;
			}

			/**
			 * Example component type for an application.
			 *
			 * Represents functionality provided by a code library to power a component withing the application.
			 *
			 * This example uses ComponentSchemaCollection to allow the component to define schema which reference collections of schema from the application configuration.
			 * This makes it possible to implement the "open polymorphism" pattern, including handling recursive cases.
			 */
			interface MyAppComponent {
				readonly itemTypes: ComponentSchemaCollection<MyAppConfig, ItemSchema>;
			}

			/**
			 * The application specific compose logic.
			 *
			 * Information from the components can be aggregated into the configuration.
			 */
			function composeComponents(allComponents: readonly MyAppComponent[]): MyAppConfig {
				const lazyConfig = () => config;
				const ItemTypes = composeComponentSchema(
					allComponents.map((c) => c.itemTypes),
					lazyConfig,
				);
				const config: MyAppConfig = { ItemTypes };
				return config;
			}

			// An example simple component
			const textComponent: MyAppComponent = {
				itemTypes: (): LazyArray<ItemSchema> => [() => TextItem],
			};

			// An example component which references schema from the configuration and can be recursive through it.
			const containerComponent: MyAppComponent = {
				itemTypes: (lazyConfig: () => MyAppConfig): LazyArray<ItemSchema> => [
					() => createContainer(lazyConfig()),
				],
			};
			function createContainer(config: MyAppConfig): ItemSchema {
				class Container extends sf.array("Container", config.ItemTypes) {}
				class ContainerItem extends sf.object("ContainerItem", {
					...itemFields,
					container: Container,
				}) {
					public static readonly description = "Text";
					public static default(): TextItem {
						return new TextItem({ text: "", location: { x: 0, y: 0 } });
					}

					public foo(): void {}
				}

				return ContainerItem;
			}

			const appConfig = composeComponents([containerComponent, textComponent]);

			const treeConfig = new TreeViewConfiguration({
				schema: appConfig.ItemTypes,
				enableSchemaValidation: true,
				preventAmbiguity: true,
			});
		});
	});
});
