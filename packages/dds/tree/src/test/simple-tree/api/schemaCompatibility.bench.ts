/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkDurationBatchless, benchmarkIt } from "@fluid-tools/benchmark";

import { MockNodeIdentifierManager } from "../../../feature-libraries/index.js";
import { SchematizingSimpleTreeView } from "../../../shared-tree/index.js";
import {
	checkSchemaCompatibility,
	checkCompatibility,
	type ImplicitFieldSchema,
	SchemaFactoryAlpha,
	toUpgradeSchema,
	TreeViewConfigurationAlpha,
} from "../../../simple-tree/index.js";
import { configureBenchmarkHooks, checkoutWithContent } from "../../utils.js";

/**
 * Registers a benchmark that times one operation per iteration.
 *
 * @remarks
 * Fixture construction belongs outside the operation unless setup is the cost being measured.
 * The result assertion runs outside the timed region.
 * These benchmarks measure elapsed time, not allocation or retained memory separately.
 *
 * @param title - Scenario name reported by the benchmark runner.
 * @param operation - Operation to time. Its result must not be null; undefined is permitted.
 */
function measure(title: string, operation: () => unknown): void {
	benchmarkIt({
		title,
		...benchmarkDurationBatchless({
			maxBenchmarkDurationSeconds: 1,
			benchmarkFn: (state) => {
				let running: boolean;
				do {
					let result: unknown;
					running = state.time(() => {
						result = operation();
					});
					// Consume the result outside the timer without rejecting valid undefined results.
					assert.notEqual(result, null);
				} while (running);
			},
		}),
	});
}

describe("Schema compatibility benchmarks", () => {
	configureBenchmarkHooks();

	// Vary schema size and mismatch count while keeping schema construction outside the timer.
	for (const fieldCount of [10, 100, 1000]) {
		for (const scenario of [
			"identical",
			"first field differs",
			"all fields differ",
		] as const) {
			const factory = new SchemaFactoryAlpha("compatibility-benchmark");
			const storedFields: Record<string, ImplicitFieldSchema> = {};
			const viewFields: Record<string, ImplicitFieldSchema> = {};
			for (let index = 0; index < fieldCount; index++) {
				const key = `field${index}`;
				storedFields[key] = factory.number;
				viewFields[key] =
					scenario === "all fields differ" ||
					(scenario === "first field differs" && index === 0)
						? factory.string
						: factory.number;
			}
			const stored = toUpgradeSchema(factory.object("Node", storedFields));
			const view = new TreeViewConfigurationAlpha({
				schema: factory.object("Node", viewFields),
			});

			// Compute a fresh status on every iteration; these cases do not measure cached live views.
			measure(
				`${scenario}, ${fieldCount} fields, flags only`,
				() => checkSchemaCompatibility(view, stored).canView,
			);
			measure(`${scenario}, ${fieldCount} fields, serialize`, () =>
				JSON.stringify(checkSchemaCompatibility(view, stored)),
			);
		}
	}

	// Measures compatibility checking with ignored persisted metadata of varying sizes.
	const metadataFactory = new SchemaFactoryAlpha("diagnostic-metadata-benchmark");
	for (const size of [10, 100, 1000]) {
		const metadata = Object.fromEntries(
			Array.from({ length: size }, (_, index) => [
				`key${index}`,
				{ values: [index, `value${index}`, null] },
			]),
		);
		const original = metadataFactory.objectAlpha(
			"Metadata",
			{},
			{ persistedMetadata: { label: "before", metadata } },
		);
		const schema = metadataFactory.objectAlpha(
			"Metadata",
			{},
			{ persistedMetadata: { metadata, label: "after" } },
		);
		const stored = toUpgradeSchema(original);
		const view = new TreeViewConfigurationAlpha({ schema });
		measure(
			`metadata only, ${size} entries, flags only`,
			() => checkSchemaCompatibility(view, stored).canView,
		);
		measure(`metadata only, ${size} entries, serialize`, () =>
			JSON.stringify(checkSchemaCompatibility(view, stored)),
		);
	}
	// Measures an accepted staged type that produces no blocker lists.
	const staged = new TreeViewConfigurationAlpha({
		schema: metadataFactory.types([
			metadataFactory.number,
			metadataFactory.staged(metadataFactory.string),
		]),
	});
	const numberStored = toUpgradeSchema(metadataFactory.number);
	measure(
		"staging only, flags only",
		() => checkSchemaCompatibility(staged, numberStored).canView,
	);
	const numberView = new TreeViewConfigurationAlpha({ schema: metadataFactory.number });
	// Include the public helper's schema conversion and configuration work in this measurement.
	measure("standalone helper, staging only", () => checkCompatibility(numberView, staged));

	// Empty content limits data-processing work in the live-view lifecycle measurements.
	const emptyView = new TreeViewConfigurationAlpha({
		schema: metadataFactory.optional(metadataFactory.object("Empty", {})),
	});
	const emptyStored = toUpgradeSchema(emptyView.schema);
	const checkout = checkoutWithContent({ schema: emptyStored, initialTree: undefined });
	// Reuse the checkout, but include view construction, status access, and disposal in each iteration.
	measure("live view creation, empty content", () => {
		const view = new SchematizingSimpleTreeView(
			checkout,
			emptyView,
			new MockNodeIdentifierManager(),
		);
		const result = view.compatibility.canView;
		view.dispose();
		return result;
	});
	// Keep the persistent view on a separate checkout from the views created and disposed above.
	let live: SchematizingSimpleTreeView<typeof emptyView.schema>;
	const liveCheckout = checkoutWithContent({ schema: emptyStored, initialTree: undefined });
	before(() => {
		live = new SchematizingSimpleTreeView(
			liveCheckout,
			emptyView,
			new MockNodeIdentifierManager(),
		);
	});
	after(() => {
		live.dispose();
		checkout.dispose();
		liveCheckout.dispose();
	});
	measure("cached live status access", () => live.compatibility.canView);
	measure("live schema recomputation, empty content", () => {
		// Reapplying the schema triggers schema-change processing even though its content is unchanged.
		liveCheckout.storedSchema.apply(emptyStored);
		return live.compatibility.canView;
	});
});
