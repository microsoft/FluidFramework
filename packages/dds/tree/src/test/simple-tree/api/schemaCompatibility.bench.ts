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
	type SchemaComparisonStatusAlpha,
	SchemaFactoryAlpha,
	toUpgradeSchema,
	TreeViewConfigurationAlpha,
} from "../../../simple-tree/index.js";
import { configureBenchmarkHooks, checkoutWithContent } from "../../utils.js";

// Compare callers that only read flags with callers that access or serialize diagnostic lists.
// Access order and repeated reads also provide comparison cases for any future lazy implementation.
const accessPatterns = [
	"flags only",
	"view subset",
	"all lists",
	"reverse list order",
	"repeated access",
	"serialize",
] as const;

/**
 * Reads a compatibility result using the selected caller access pattern.
 *
 * @remarks
 * Conditional lists are accessed only when their corresponding flag is false.
 * The caller includes both compatibility computation and this access in the timed operation.
 * Array construction and JSON serialization are therefore part of the measured cost where used.
 *
 * @param status - Compatibility result produced for the current iteration.
 * @param access - Properties to read, or whether to serialize the entire status.
 * @returns The accessed value, collected values, or serialized status.
 * Returns undefined when the viewing subset is requested but viewing is permitted.
 */
function consume(
	status: SchemaComparisonStatusAlpha,
	access: (typeof accessPatterns)[number],
): unknown {
	switch (access) {
		case "flags only": {
			return status.canView;
		}
		case "view subset": {
			return status.canView ? undefined : status.viewDiscrepancies;
		}
		case "all lists": {
			return [
				status.allDiscrepancies,
				status.canView ? undefined : status.viewDiscrepancies,
				status.canUpgrade ? undefined : status.upgradeDiscrepancies,
				status.isEquivalent ? undefined : status.equivalenceDiscrepancies,
			];
		}
		case "reverse list order": {
			return [
				status.isEquivalent ? undefined : status.equivalenceDiscrepancies,
				status.canUpgrade ? undefined : status.upgradeDiscrepancies,
				status.canView ? undefined : status.viewDiscrepancies,
				status.allDiscrepancies,
			];
		}
		case "repeated access": {
			return [status.allDiscrepancies, status.allDiscrepancies, status.allDiscrepancies];
		}
		case "serialize": {
			return JSON.stringify(status);
		}
		default: {
			assert.fail("Unknown benchmark access pattern");
		}
	}
}

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
			for (const access of accessPatterns) {
				measure(`${scenario}, ${fieldCount} fields, ${access}`, () =>
					consume(checkSchemaCompatibility(view, stored), access),
				);
			}
		}
	}

	// Change only a metadata label while varying the nested payload that must be compared or serialized.
	// Metadata differences produce diagnostics without changing compatibility flags.
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
		for (const access of ["flags only", "serialize"] as const) {
			measure(`metadata only, ${size} entries, ${access}`, () =>
				consume(checkSchemaCompatibility(view, stored), access),
			);
		}
	}
	// An accepted staged type adds diagnostic information without preventing access to stored numbers.
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
