/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	BenchmarkType,
	benchmark,
	benchmarkCustom,
	isInPerformanceTestingMode,
	type IMeasurementReporter,
} from "@fluid-tools/benchmark";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";

import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import type { TreeCheckout } from "../../../shared-tree/index.js";
import { TreeViewConfiguration } from "../../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

import {
	createInitialBoard,
	Root,
	setupForestForIncrementalSummarization,
} from "./forestSummarizerTestUtils.js";

function updateItems(
	checkout: TreeCheckout,
	itemCount: number,
	summarySequenceNumber: number,
): void {
	const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
	const root = view.root;
	// Simulate 10% of items changing (not timed)
	// Update the summary field which will cause the entire BarItem subtree to be re-summarized
	for (let i = 0; i < itemCount; i++) {
		if (i % 10 === 0) {
			const item = root.barArray.at(i);
			if (item !== undefined) {
				item.summary = `Updated summary ${summarySequenceNumber}`;
			}
		}
	}
}

describe("Forest Summarizer benchmarks", () => {
	// Scale test parameters based on performance testing mode
	const itemCounts = isInPerformanceTestingMode ? [1000, 10000, 50000] : [10, 100, 1000];

	configureBenchmarkHooks();

	describe("Incremental summarization performance", () => {
		for (const itemCount of itemCounts) {
			const benchmarkType =
				itemCount >= 100 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

			describe("Regular summaries", () => {
				// Baseline summary
				const { forestSummarizer: baselineSummarizer, checkout: baseLineCheckout } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount), {
						jsonValidator: FormatValidatorBasic,
						minVersionForCollab: FluidClientVersion.v2_73, // Pre incremental summarization
					});

				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				benchmark({
					type: benchmarkType,
					title: `Baseline summary with ${itemCount} items`,
					benchmarkFn: () => {
						baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext1,
						});
					},
				});

				// Baseline summary with no changes
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				benchmark({
					type: benchmarkType,
					title: `Baseline summary with ${itemCount} unchanged items`,
					benchmarkFn: () => {
						baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext2,
						});
					},
				});

				// Baseline summary with 10% changes
				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber,
					summaryPath: "",
				};
				benchmark({
					type: benchmarkType,
					title: `Baseline summary with ${itemCount} items (10% changed)`,
					benchmarkFn: () => {
						updateItems(
							baseLineCheckout,
							itemCount,
							incrementalSummaryContext3.summarySequenceNumber,
						);
						baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext3,
						});
					},
				});
			});

			describe("Incremental summaries", () => {
				// Incremental summary
				const { forestSummarizer: incrementalSummarizer, checkout: incrementalCheckout } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount));

				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};

				benchmark({
					type: benchmarkType,
					title: `Incremental summary with ${itemCount} items`,
					benchmarkFn: () => {
						incrementalSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext1,
						});
					},
				});

				// Incremental with no changes
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				benchmark({
					type: benchmarkType,
					title: `Incremental summary with ${itemCount} unchanged items`,
					benchmarkFn: () => {
						incrementalSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext2,
						});
					},
				});

				// Incremental summary with 10% changes
				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber,
					summaryPath: "",
				};
				benchmark({
					type: benchmarkType,
					title: `Incremental summary with ${itemCount} items (10% changed)`,
					benchmarkFn: () => {
						updateItems(
							incrementalCheckout,
							itemCount,
							incrementalSummaryContext3.summarySequenceNumber,
						);
						incrementalSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext3,
						});
					},
				});
			});
		}
	});

	describe("Summary size", () => {
		/**
		 * Helper function to measure the size of a summary tree.
		 */
		function measureSummarySize(
			summaryTree: object,
			reporter: IMeasurementReporter,
			minLength?: number,
			maxLength?: number,
		): void {
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			reporter.addMeasurement("summarySize (bytes)", summarySize);
			if (minLength !== undefined) {
				assert(
					summarySize >= minLength,
					`Summary size ${summarySize} is less than minimum ${minLength}`,
				);
			}
			if (maxLength !== undefined) {
				assert(
					summarySize <= maxLength,
					`Summary size ${summarySize} exceeds maximum ${maxLength}`,
				);
			}
		}

		for (const itemCount of itemCounts) {
			const benchmarkType =
				itemCount >= 100 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

			describe("Regular summaries", () => {
				// Non-incremental: Full summarization without handle reuse
				const { forestSummarizer: baselineSummarizer, checkout: baseLineCheckout } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount), {
						jsonValidator: FormatValidatorBasic,
						minVersionForCollab: FluidClientVersion.v2_73, // Pre incremental summarization
					});

				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				benchmarkCustom({
					type: benchmarkType,
					title: `Baseline summary with ${itemCount} items`,
					run: (reporter) => {
						const summaryTree = baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext1,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});

				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				// Baseline summary with no changes
				benchmarkCustom({
					type: benchmarkType,
					title: `Baseline summary with ${itemCount} unchanged items`,
					run: (reporter) => {
						const summaryTree = baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext2,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});

				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber,
					summaryPath: "",
				};
				// Baseline summary with 10% changes
				benchmarkCustom({
					type: benchmarkType,
					title: `Baseline summary with ${itemCount} items (10% changed)`,
					run: (reporter) => {
						updateItems(
							baseLineCheckout,
							itemCount,
							incrementalSummaryContext3.summarySequenceNumber,
						);
						const summaryTree = baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext3,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});
			});

			describe("Incremental summaries", () => {
				// Incremental: Full summarization without handle reuse
				const { forestSummarizer: incrementalSummarizer, checkout: incrementalCheckout } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount));

				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};

				benchmarkCustom({
					type: benchmarkType,
					title: `Incremental summary with ${itemCount} items`,
					run: (reporter) => {
						const summaryTree = incrementalSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext1,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});

				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				// Incremental with no changes
				benchmarkCustom({
					type: benchmarkType,
					title: `Incremental summary with ${itemCount} unchanged items`,
					run: (reporter) => {
						const summaryTree = incrementalSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext2,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});

				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber + 10,
					latestSummarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber,
					summaryPath: "",
				};
				benchmarkCustom({
					type: benchmarkType,
					title: `Incremental summary with ${itemCount} items (10% changed)`,
					run: (reporter) => {
						// Incremental summary with 10% changes
						updateItems(
							incrementalCheckout,
							itemCount,
							incrementalSummaryContext3.summarySequenceNumber,
						);
						const summaryTree = incrementalSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: incrementalSummaryContext3,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});
			});
		}
	});
});
