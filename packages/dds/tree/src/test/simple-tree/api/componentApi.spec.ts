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
	// The composed configuration used by these tests.
	interface TestConfig {
		readonly items: readonly (() => string)[];
	}

	// The content each component contributes.
	interface TestComponent {
		readonly items?: Component.LazyArray<string>;
		readonly label?: string;
	}

	type TestFactory = Component.Factory<TestConfig, TestComponent>;

	function compose(
		components: readonly TestFactory[],
	): Component.ComposedComponents<TestConfig, TestComponent> {
		return Component.composeComponents(components, (composed) => ({
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
});
