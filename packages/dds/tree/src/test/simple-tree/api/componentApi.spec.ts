/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { Component } from "../../../componentApi.js";

/**
 * Unit tests for the {@link Component} composition utilities.
 *
 * @remarks
 * These supplement the worked examples/integration tests in `openPolymorphism.integration.ts` by covering the
 * individual behaviors of the API in isolation.
 */
describe("Component", () => {
	// A trivial example that uses none of the lazy array collections.
	it("Minimal self contained example", () => {
		type MyComponent = string;
		type MyComponentFactory = Component.Factory<MyComponent>;

		const a: MyComponentFactory = () => "a";
		const b: MyComponentFactory = () => "b";

		const composed = Component.compose([a, b]);

		assert.deepEqual(composed.components, ["a", "b"]);
	});

	it("self contained demo", () => {
		/**
		 * Some arbitrary item type to collect from the components.
		 */
		interface MyItem {
			readonly name: string;
			readonly data: unknown;
		}

		interface MyComponent {
			items?: Component.LazyArray<MyItem>;
		}

		interface InputConfig {
			readonly includeUnstableFeatures: boolean;
		}

		interface ComposeConfig {
			readonly input: InputConfig;
			readonly lazy: () => LazyComposeConfig;
		}

		interface LazyComposeConfig {
			/**
			 * The items contributed by all components, lazily evaluated.
			 * @remarks
			 * Components can refer to (and capture) this array during construction,
			 * but can't evaluate its items until after composition completes.
			 */
			readonly items: readonly (() => MyItem)[];
		}

		interface OutputConfig {
			readonly items: readonly MyItem[];
		}

		type MyComponentFactory = Component.Factory<MyComponent, ComposeConfig>;

		// Example showing how a component could use configuration settings when computing its output.
		const unstableItem = { name: "unstable", data: 1 };
		const unstableComponent: MyComponentFactory = (config) => ({
			items: () => (config().input.includeUnstableFeatures ? [() => unstableItem] : []),
		});

		// Example showing how a component can consume composed configuration values co-recursively.
		const recursiveComponent: MyComponentFactory = (config) => {
			return {
				items: () => [
					Component.memoize(() => ({ name: "recursive", data: config().lazy().items })),
				],
			};
		};

		function myConfigure(
			inputConfig: InputConfig,
			allComponents: readonly MyComponentFactory[],
		): OutputConfig {
			const composed = Component.compose(allComponents, (c) => {
				const config: ComposeConfig = {
					input: inputConfig,
					lazy: () => lazy,
				};
				return config;
			});

			// At this point it is now legal to evaluate lazy values:
			const lazy = {
				items: composed.getComposed("items"),
			};
			const items = composed.config.lazy().items.map((x) => x());
			const items2 = composed.getComposed("items");
			assert.deepEqual(composed.config.lazy().items, items2);

			return { items };
		}

		assert.deepEqual(myConfigure({ includeUnstableFeatures: true }, []).items, []);
		assert.deepEqual(
			myConfigure({ includeUnstableFeatures: false }, [unstableComponent]).items,
			[],
		);
		assert.deepEqual(
			myConfigure({ includeUnstableFeatures: true }, [unstableComponent]).items,
			[unstableItem],
		);

		{
			const composed = myConfigure({ includeUnstableFeatures: true }, [recursiveComponent]);
			assert.equal(composed.items.length, 1);
			const item = composed.items[0];
			const data = item.data as (() => unknown)[];
			assert.equal(data.length, 1);
			const innerItem = data[0]() as MyItem;
			assert.equal(innerItem, item);
		}
		{
			const composed = myConfigure({ includeUnstableFeatures: true }, [
				unstableComponent,
				recursiveComponent,
			]);
			assert.equal(composed.items.length, 2);
			assert.equal(composed.items[0], unstableItem);
			const item = composed.items[1];
			const data = item.data as (() => unknown)[];
			assert.equal(data.length, 2);
			assert.equal(data[0](), unstableItem);
			const innerItem = data[1]() as MyItem;
			assert.equal(innerItem, item);
		}
	});

	// The composed configuration used by these tests.
	interface TestConfig {
		readonly items: readonly (() => string)[];
	}

	// The content each component contributes.
	interface TestComponent {
		readonly items?: Component.LazyArray<string>;
		readonly label?: string;
	}

	type TestFactory = Component.Factory<TestComponent, TestConfig>;

	function compose(
		components: readonly TestFactory[],
	): Component.Composed<TestComponent, TestConfig> {
		return Component.compose(components, (composed) => ({
			items: composed.getComposed("items"),
		}));
	}

	it("getComposed aggregates lazy arrays from all components", () => {
		const a: TestFactory = () => ({ items: () => [() => "a1", () => "a2"] });
		const b: TestFactory = () => ({ items: () => [() => "b1"] });

		const composed = compose([a, b]);
		const evaluated = composed.config.items.map((lazy) => lazy());
		assert.deepEqual(evaluated, ["a1", "a2", "b1"]);
	});

	it("getComposed skips components which omit the property", () => {
		const withItems: TestFactory = () => ({ items: () => [() => "x"] });
		const withoutItems: TestFactory = () => ({ label: "no items" });

		const composed = compose([withItems, withoutItems]);
		assert.deepEqual(
			composed.config.items.map((lazy) => lazy()),
			["x"],
		);
	});

	it("getComponent returns the content produced by a factory", () => {
		const factory: TestFactory = () => ({ label: "hello" });
		const composed = compose([factory]);
		assert.equal(composed.getComponent(factory).label, "hello");
	});

	it("getComponent throws for a factory not included in the composition", () => {
		const included: TestFactory = () => ({ label: "included" });
		const excluded: TestFactory = () => ({ label: "excluded" });
		const composed = compose([included]);
		assert.throws(() => composed.getComponent(excluded), validateUsageError(/not included/));
	});

	it("components can lazily reference the composed configuration", () => {
		// This component contributes an item derived from the full composed configuration,
		// demonstrating that the lazy configuration can be read after composition completes.
		const counter: TestFactory = (lazyConfig) => ({
			items: () => [() => `count:${lazyConfig().items.length}`],
		});
		const other: TestFactory = () => ({ items: () => [() => "other"] });

		const composed = compose([counter, other]);
		// Two items total: the counter's own item and "other".
		const values = composed.config.items.map((lazy) => lazy());
		assert.deepEqual(values, ["count:2", "other"]);
	});

	it("throws if a component evaluates the configuration during composition", () => {
		const eager: TestFactory = (lazyConfig) => {
			// Reading the configuration during composition is not allowed.
			lazyConfig();
			return {};
		};
		assert.throws(
			() => compose([eager]),
			validateUsageError(/Configuration not yet available/),
		);
	});

	it("getConfigured evaluates once and caches the result", () => {
		let evaluations = 0;
		const factory: TestFactory = () => ({ label: "cached" });
		const composed = compose([factory]);

		const configurable: Component.Configurable<TestConfig, number, TestComponent> = {
			configure: (config) => {
				evaluations += 1;
				return config.items.length;
			},
		};

		const first = composed.getConfigured(configurable);
		const second = composed.getConfigured(configurable);
		assert.equal(first, second);
		assert.equal(evaluations, 1);
	});

	it("exposes the composed components and configuration", () => {
		const a: TestFactory = () => ({ label: "a" });
		const b: TestFactory = () => ({ label: "b" });
		const composed = compose([a, b]);

		assert.deepEqual(
			composed.components.map((c) => c.label),
			["a", "b"],
		);
		assert.deepEqual(composed.config.items, []);
	});

	describe("memoize", () => {
		it("evaluates the factory only once and caches the result", () => {
			let calls = 0;
			const value = {};
			const cached = Component.memoize(() => {
				calls += 1;
				return value;
			});

			assert.equal(calls, 0); // Not evaluated until first call.
			assert.equal(cached(), value);
			assert.equal(cached(), value);
			assert.equal(calls, 1);
		});

		it("caches a returned undefined", () => {
			let calls = 0;
			const cached = Component.memoize(() => {
				calls += 1;
				return undefined;
			});

			assert.equal(cached(), undefined);
			assert.equal(cached(), undefined);
			assert.equal(calls, 1);
		});
	});
});
