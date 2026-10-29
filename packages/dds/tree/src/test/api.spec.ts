/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";

import {
	asAlpha,
	SchemaFactoryAlpha,
	type TreeViewAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../entrypoints/alpha.js";
import {
	asBeta,
	SchemaFactoryBeta,
	type TreeViewBeta,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../entrypoints/beta.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type TreeView,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../entrypoints/public.js";
import type { areSafelyAssignable, requireTrue } from "../util/index.js";

import { getView } from "./utils.js";

describe("API conversions", () => {
	describe("SchemaFactory", () => {
		const constructors: readonly (new (scope: string | undefined) => SchemaFactory)[] = [
			SchemaFactory,
			SchemaFactoryBeta,
			SchemaFactoryAlpha,
		];
		for (const Constructor of constructors) {
			for (const scope of ["com.example", undefined]) {
				it(`${Constructor.name} supports both conversions with scope ${scope}`, () => {
					const factory = new Constructor(scope);
					const beta = asBeta(factory);
					const alpha = asAlpha(factory);

					assert.equal(beta, factory);
					assert.equal(alpha, factory);
					assert.equal(asAlpha(beta), factory);
					assert.equal(asBeta(alpha), factory);
					assert.equal(asAlpha(alpha), alpha);
					assert.equal(asBeta(beta), beta);
					assert(factory instanceof SchemaFactory);
					assert(factory instanceof SchemaFactoryBeta);
					assert(factory instanceof SchemaFactoryAlpha);
					assert.equal(factory.scope, scope);

					const types = beta.types([factory.string, factory.number]);
					class Item extends factory.object("Item", { value: types }) {}
					assert.equal(new Item({ value: "text" }).value, "text");
					assert.equal(new Item({ value: 3 }).value, 3);
					class Defaulted extends alpha.objectAlpha("Defaulted", {
						count: alpha.withDefault(factory.required(factory.number), 0),
					}) {}
					assert.equal(new Defaulted({}).count, 0);
					assert.equal(new Defaulted({ count: 2 }).count, 2);

					const array = factory.array(factory.number);
					const map = factory.map(factory.string);
					assert.equal(beta.array(factory.number), array);
					assert.equal(alpha.array(factory.number), array);
					assert.equal(beta.map(factory.string), map);
					assert.equal(alpha.map(factory.string), map);
					assert.equal(beta.record(factory.number), alpha.record(factory.number));
					assert.equal(
						factory.arrayRecursive("RecursiveArray", factory.number).implicitlyConstructable,
						false,
					);
					assert.equal(
						factory.mapRecursive("RecursiveMap", factory.number).implicitlyConstructable,
						false,
					);
					assert.equal(
						beta.recordRecursive("RecursiveRecord", factory.number).implicitlyConstructable,
						false,
					);

					const scopedBeta = beta.scopedFactory("child");
					const scopedAlpha = alpha.scopedFactoryAlpha("child");
					for (const child of [scopedBeta, scopedAlpha]) {
						assert(child instanceof SchemaFactoryAlpha);
						assert.equal(asAlpha(child), child);
						assert.equal(asBeta(child), child);
						assert.equal(child.scope, scope === undefined ? "child" : `${scope}.child`);
					}
				});

				it(`${Constructor.name} preserves recursive map prototypes with scope ${scope}`, () => {
					const factory = new Constructor(scope);
					class RecursiveMap extends factory.mapRecursive("RecursiveMap", [
						factory.number,
						() => RecursiveMap,
					]) {}
					const map = new RecursiveMap({ value: 1 });

					assert.equal(RecursiveMap.implicitlyConstructable, false);
					assert.equal(Object.getPrototypeOf(map), RecursiveMap.prototype);
					assert(map instanceof RecursiveMap);
					assert.equal(map instanceof Map, false);
					Object.preventExtensions(map);
					assert.equal(Object.getPrototypeOf(map), RecursiveMap.prototype);
					assert.equal(map.get("value"), 1);
				});
			}
		}

		it("preserves literal scopes, names, and allowed-type inference", () => {
			const factory = new SchemaFactory<"com.example", "Item" | "child">("com.example");
			const beta = asBeta(factory);
			const alpha = asAlpha(factory);
			type _beta = requireTrue<
				areSafelyAssignable<typeof beta, SchemaFactoryBeta<"com.example", "Item" | "child">>
			>;
			type _alpha = requireTrue<
				areSafelyAssignable<typeof alpha, SchemaFactoryAlpha<"com.example", "Item" | "child">>
			>;

			const types = beta.types([factory.string, factory.number]);
			class Item extends factory.object("Item", { value: types }) {}
			const item = new Item({ value: "text" });
			type _value = requireTrue<areSafelyAssignable<typeof item.value, string | number>>;
			type _identifier = requireTrue<
				areSafelyAssignable<typeof Item.identifier, "com.example.Item">
			>;
			const child = asAlpha(beta.scopedFactory<"child", "Nested">("child"));
			type _child = requireTrue<
				areSafelyAssignable<typeof child, SchemaFactoryAlpha<"com.example.child", "Nested">>
			>;

			// @ts-expect-error Conversions must preserve the allowed schema names.
			beta.object("Other", {});
			// @ts-expect-error Conversions must preserve the allowed schema names.
			alpha.objectAlpha("Other", {});
			// @ts-expect-error Beta APIs must not expose alpha-only methods.
			const hiddenAlpha = beta.withDefault;
			// @ts-expect-error The public factory type must not expose beta-only methods.
			const hiddenBeta = factory.types;
			// @ts-expect-error Instance conversions do not support factory constructors.
			const convertedConstructor = asBeta(SchemaFactory);
			// @ts-expect-error Instance conversions do not support factory constructors.
			const convertedAlphaConstructor = asAlpha(SchemaFactory);
			// @ts-expect-error Schema constructors are not views or factories.
			const convertedSchema = asBeta(Item);

			const unscoped = asAlpha(new SchemaFactory<undefined, 1 | 2>(undefined));
			const unscopedBeta = asBeta(unscoped);
			type _unscoped = requireTrue<
				areSafelyAssignable<typeof unscoped, SchemaFactoryAlpha<undefined, 1 | 2>>
			>;
			type _unscopedBeta = requireTrue<
				areSafelyAssignable<typeof unscopedBeta, SchemaFactoryBeta<undefined, 1 | 2>>
			>;
			class NumericName extends unscoped.objectAlpha(1, {}) {}
			assert.equal(NumericName.identifier, "1");
		});

		it("preserves type parameters in generic callers", () => {
			function convert<TScope extends string | undefined, TName extends string | number>(
				input: SchemaFactory<TScope, TName>,
			): [SchemaFactoryBeta<TScope, TName>, SchemaFactoryAlpha<TScope, TName>] {
				return [asBeta(input), asAlpha(input)];
			}
			const factory = new SchemaFactory<"com.example", "Item">("com.example");
			const [beta, alpha] = convert(factory);
			assert.equal(beta, factory);
			assert.equal(alpha, factory);
		});

		for (const moduleName of ["schemaFactory", "schemaFactoryBeta", "schemaFactoryAlpha"]) {
			it(`constructs factories after importing ${moduleName} in isolation`, () => {
				const moduleUrl = new URL(`../simple-tree/api/${moduleName}.js`, import.meta.url);
				const factoryModuleUrl = new URL(
					"../simple-tree/api/schemaFactory.js",
					import.meta.url,
				);
				execFileSync(
					process.execPath,
					[
						"--input-type=module",
						"--eval",
						`
						import { strict as assert } from "node:assert";
						await import(process.argv[1]);
						const module = await import(process.argv[2]);
						for (const Factory of [module.SchemaFactory, module.SchemaFactoryBeta, module.SchemaFactoryAlpha]) {
							const factory = new Factory("com.example");
							assert.equal(factory.constructor.name, "SchemaFactoryAlpha");
							assert.equal(typeof factory.types, "function");
							assert.equal(typeof factory.withDefault, "function");
						}
						`,
						moduleUrl.href,
						factoryModuleUrl.href,
					],
					{ timeout: 10_000 },
				);
			});
		}
	});

	it("preserves specialized converter functions and callback inference", () => {
		const factory = new SchemaFactory("com.example");
		const schema = factory.object("Root", { value: factory.number });
		const config = new TreeViewConfiguration({ schema });
		const view = getView(config);
		const betaConverter = asBeta<typeof schema>;
		const alphaConverter = asAlpha<typeof schema>;
		const beta = betaConverter(view);
		const alpha = alphaConverter(view);
		type _beta = requireTrue<areSafelyAssignable<typeof beta, TreeViewBeta<typeof schema>>>;
		type _alpha = requireTrue<areSafelyAssignable<typeof alpha, TreeViewAlpha<typeof schema>>>;
		assert.equal(beta, view);
		assert.equal(alpha, view);
		assert.equal(alphaConverter(config), config);

		const convertedViews = [view].map(asBeta);
		type _views = requireTrue<
			areSafelyAssignable<typeof convertedViews, TreeViewBeta<typeof schema>[]>
		>;
		assert.equal(convertedViews[0], view);

		function convertView<TSchema extends ImplicitFieldSchema>(
			input: TreeView<TSchema>,
		): TreeViewBeta<TSchema> {
			return asBeta(input);
		}
		assert.equal(convertView(view), view);
		view.dispose();

		const MapSchema = factory.map("Map", factory.number);
		const map = new MapSchema({ first: 1 });
		const convertedMaps = [map].map(asAlpha);
		assert.equal(convertedMaps[0], map);
		convertedMaps[0].clear();
		assert.equal(map.size, 0);

		const scopedFactory = new SchemaFactory<"com.example", "Item">("com.example");
		const convertedFactories = [scopedFactory].map(asBeta);
		type _factories = requireTrue<
			areSafelyAssignable<
				typeof convertedFactories,
				SchemaFactoryBeta<"com.example", "Item">[]
			>
		>;
		assert.equal(convertedFactories[0], scopedFactory);
	});

	it("preserves existing view, configuration, array, and map conversions", () => {
		const factory = new SchemaFactory("com.example");
		const schema = factory.object("Root", { value: factory.number });
		const config = new TreeViewConfiguration({ schema });
		assert.equal(asAlpha(config), config);
		assert.equal(asAlpha(config).root.allowedTypeSet.has(schema), true);

		const view = getView(config);
		const beta = asBeta(view);
		const alpha = asAlpha(view);
		type _beta = requireTrue<areSafelyAssignable<typeof beta, TreeViewBeta<typeof schema>>>;
		type _alpha = requireTrue<areSafelyAssignable<typeof alpha, TreeViewAlpha<typeof schema>>>;
		assert.equal(beta, view);
		assert.equal(alpha, view);
		view.dispose();

		const ArraySchema = factory.array("Array", factory.number);
		const array = new ArraySchema([1, 2]);
		assert.equal(asAlpha(array), array);
		assert.equal(asAlpha(array).at(-1), 2);

		const MapSchema = factory.map("Map", factory.number);
		const map = new MapSchema({ first: 1 });
		assert.equal(asAlpha(map), map);
		asAlpha(map).clear();
		assert.equal(map.size, 0);
	});
});
