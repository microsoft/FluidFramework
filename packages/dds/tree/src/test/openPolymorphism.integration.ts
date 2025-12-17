/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

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
import { Tree } from "../shared-tree/index.js";
import { getOrAddInMap, type requireAssignableTo } from "../util/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
 * Implementations should declare schema whose nodes extends this interface, and have the schema statically implement ItemSchema.
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
	// Currently, allowed type arrays are processed eagerly, making this pattern no longer work.
	describe.skip("mutable static registry", () => {
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

	// Example using a components library (`Component` namespace below).
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
				public static readonly description = "Text";
				public static default(): TextItem {
					return new TextItem({ text: "", location: { x: 0, y: 0 } });
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

	// A more complex example showing some challenging edge cases.
	// Includes:
	// - A component with a schema in multiple open polymorphic collections.
	// - Access to exports from components which depend on the injected set of components.
	it("Component library", () => {
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

		type MyAppComponent = Component.Factory<MyAppConfigPartial, MyAppComponentContent>;

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
					public static readonly description = "Text";
					public static default(): TextItem {
						return new TextItem({ text: "", location: { x: 0, y: 0 } });
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

				class Blank extends sf.object("Blank", { ...itemFields }) implements Background, Item {
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
			readonly composed: Component.ComposedComponents<
				MyAppConfigPartial,
				MyAppComponentContent
			>;
		}

		/**
		 * The application specific compose logic.
		 *
		 * Information from the components can be aggregated into the configuration.
		 */
		function composeComponents(allComponents: readonly MyAppComponent[]): MyAppConfig {
			const composed = Component.composeComponents(allComponents, (c) => {
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

/**
 * Utilities for helping implement various application component design patterns.
 */
export namespace Component {
	/**
	 * Function which takes in a lazy configuration and returns a collection of schema types.
	 * @remarks
	 * This allows the schema to reference items from the configuration, which could include themselves recursively.
	 *
	 * The execution of this function may not evaluate `lazyConfiguration` (doing so will error):
	 * instead the returned `TComponent` can capture the `lazyConfiguration` and evaluate it at a later time (after all components have been composed).
	 */
	export type Factory<TConfig, TComponent> = (lazyConfiguration: () => TConfig) => TComponent;

	/**
	 * A function which returns an array of lazy values (like {@link AllowedTypes} where all of the values are lazy) which evaluate to `T`.
	 */
	export type LazyArray<T> = () => readonly (() => T)[];

	class Config<TConfig, TComponent> implements ComposedComponents<TConfig, TComponent> {
		public readonly componentsMap: ReadonlyMap<Factory<TConfig, TComponent>, TComponent>;

		public readonly evaluatedMap: Map<Configurable<TConfig, unknown, TComponent>, unknown> =
			new Map();

		public readonly components: readonly TComponent[];

		/**
		 * Portion of the config computed first.
		 */
		public readonly config: TConfig;

		public constructor(
			allComponents: readonly Factory<TConfig, TComponent>[],
			lazyConfiguration: (composed: ComposedComponents<TConfig, TComponent>) => TConfig,
		) {
			// eslint-disable-next-line no-undef-init
			let config: TConfig | undefined = undefined;
			const lazyConfigInner = () => {
				if (config === undefined) {
					throw new Error("Configuration not yet available");
				}
				return config;
			};
			this.componentsMap = new Map(allComponents.map((c) => [c, c(lazyConfigInner)]));
			this.components = Array.from(this.componentsMap.values());
			config = lazyConfiguration(this);
			this.config = config;
		}

		public getComponent<TFactory extends Factory<TConfig, TComponent>>(
			factory: TFactory,
		): ReturnType<TFactory> {
			const found = this.componentsMap.get(factory);
			if (found === undefined) {
				throw new UsageError("Requested component not included in this configuration");
			}
			return found as ReturnType<TFactory>;
		}

		public getConfigured<TEvaluatable extends Configurable<TConfig, unknown, TComponent>>(
			factory: TEvaluatable,
		): ReturnType<TEvaluatable["configure"]> {
			const found: unknown = getOrAddInMap(
				this.evaluatedMap,
				factory,
				factory.configure(this.config, this),
			);
			if (found === undefined) {
				throw new UsageError("Requested component not included in this configuration");
			}
			return found as ReturnType<TEvaluatable["configure"]>;
		}

		public getComposed<
			TKey extends keyof {
				[Property in keyof TComponent as TComponent[Property] extends LazyArray<unknown>
					? Property
					: never]: boolean;
			},
		>(
			property: TKey,
		): readonly (TComponent[TKey] extends LazyArray<infer U> ? () => U : never)[] {
			const result = this.components.flatMap((c) => {
				const prop = c[property] as LazyArray<unknown>;
				if (prop === undefined) {
					return [];
				}
				return prop();
			});
			return result as (TComponent[TKey] extends LazyArray<infer U> ? () => U : never)[];
		}
	}

	export interface Configurable<TConfigPartial, out TResult, TComponentInner> {
		configure(
			config: TConfigPartial,
			components: ComposedComponents<TConfigPartial, TComponentInner>,
		): TResult;
	}

	/**
	 * Combine multiple {@link ComponentMinimal.ComponentSchemaCollection}s into a single {@link AllowedTypes} array.
	 */
	export function composeComponents<TConfig, TComponentInner>(
		allComponents: readonly Factory<TConfig, TComponentInner>[],
		lazyConfiguration: (composed: ComposedComponents<TConfig, TComponentInner>) => TConfig,
	): ComposedComponents<TConfig, TComponentInner> {
		const config = new Config<TConfig, TComponentInner>(allComponents, lazyConfiguration);
		return config;
	}

	/**
	 * The result of composing multiple components.
	 * @remarks
	 * Create using {@link Component.composeComponents}.
	 * @sealed
	 */
	export interface ComposedComponents<TConfig, TComponent> {
		/**
		 * The components which were composed.
		 */
		readonly components: readonly TComponent[];
		/**
		 * The configuration which was provided when composing.
		 */
		readonly config: TConfig;

		/**
		 * Get a component by its factory.
		 *
		 * @param factory - The factory to indicate which component to lookup. Must have been provided when composing.
		 * @returns The component created by the provided factory.
		 * This result is cached during composition and not reevaluated.
		 */
		getComponent<TFactory extends Factory<TConfig, TComponent>>(
			factory: TFactory,
		): ReturnType<TFactory>;

		/**
		 * Configure a {@link Configurable}.
		 * @remarks
		 * The result is cached when first evaluated.
		 */
		getConfigured<TConfigurable extends Configurable<TConfig, unknown, TComponent>>(
			configurable: TConfigurable,
		): ReturnType<TConfigurable["configure"]>;

		/**
		 * Compose the contents of a lazy array property from all components.
		 * @param property - The property of the components to compose.
		 */
		getComposed<
			TKey extends keyof {
				[Property in keyof TComponent as TComponent[Property] extends
					| LazyArray<unknown>
					| undefined
					? Property
					: never]: boolean;
			},
		>(
			property: TKey,
		): readonly (TComponent[TKey] extends LazyArray<infer U> ? () => U : never)[];
	}
}
