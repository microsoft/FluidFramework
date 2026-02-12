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
import type { ForestSummarizer } from "../../../feature-libraries/index.js";
import type { TreeCheckout } from "../../../shared-tree/index.js";
import { TreeViewConfiguration } from "../../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

import {
	createInitialBoard,
	Root,
	setupForestForIncrementalSummarization,
} from "./forestSummarizerTestUtils.js";

describe.only("Forest Summarizer benchmarks", () => {
	// Scale test parameters based on performance testing mode
	const itemCounts = isInPerformanceTestingMode ? [1000, 10000, 50000] : [10, 100, 1000];

	configureBenchmarkHooks();

	/**
	 * Helper function to update 10% of items in the board.
	 */
	function updateItems(checkout: TreeCheckout, itemCount: number): void {
		const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
		const root = view.root;
		// Simulate 10% of items changing
		// Update the summary field which will cause the entire BarItem subtree to be re-summarized
		for (let i = 0; i < itemCount; i++) {
			if (i % 10 === 0) {
				const item = root.barArray.at(i);
				if (item !== undefined) {
					item.summary = `Updated summary 10`;
				}
			}
		}
	}

	describe("summarization performance", () => {
		describe("for regular summaries", () => {
			for (const itemCount of itemCounts) {
				const benchmarkType = isInPerformanceTestingMode
					? BenchmarkType.Measurement
					: BenchmarkType.Perspective;

				// Baseline summary
				const baselineContext: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};

				let baselineSummarizer: ForestSummarizer;
				benchmark({
					type: benchmarkType,
					title: `baseline (${itemCount} items)`,
					before: () => {
						const { forestSummarizer } = setupForestForIncrementalSummarization(
							createInitialBoard(itemCount),
							{
								jsonValidator: FormatValidatorBasic,
								minVersionForCollab: FluidClientVersion.v2_73, // Necessary to force pre incremental summarization
							},
						);
						baselineSummarizer = forestSummarizer;
					},
					benchmarkFn: () => {
						baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: baselineContext,
						});
					},
				});
			}
		});

		describe("for incremental summaries", () => {
			for (const itemCount of itemCounts) {
				const benchmarkType = isInPerformanceTestingMode
					? BenchmarkType.Measurement
					: BenchmarkType.Perspective;

				let baselineSummarizer: ForestSummarizer;
				benchmark({
					type: benchmarkType,
					title: `baseline for (${itemCount} items)`,
					before: () => {
						const { forestSummarizer } = setupForestForIncrementalSummarization(
							createInitialBoard(itemCount),
						);
						baselineSummarizer = forestSummarizer;
					},
					benchmarkFn: () => {
						const baselineContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						};
						baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: baselineContext,
						});
					},
				});

				let unchangedSummarizer: ForestSummarizer;
				benchmark({
					type: benchmarkType,
					title: `unchanged for (${itemCount} items)`,
					before: () => {
						const { forestSummarizer } = setupForestForIncrementalSummarization(
							createInitialBoard(itemCount),
						);
						unchangedSummarizer = forestSummarizer;
						// First summary to establish baseline (not measured)
						const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						};
						unchangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext,
						});
					},
					benchmarkFn: () => {
						const unchangedContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: 0,
							summaryPath: "",
						};
						unchangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: unchangedContext,
						});
					},
				});

				let someChangedSummarizer: ForestSummarizer;
				benchmark({
					type: benchmarkType,
					title: `10% changes for (${itemCount} items)`,
					before: () => {
						const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
							createInitialBoard(itemCount),
						);
						someChangedSummarizer = forestSummarizer;
						// First summary to establish baseline (not measured)
						const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						};
						someChangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext,
						});
						// Simulate 10% of items changing (not timed)
						updateItems(checkout, itemCount);
					},
					benchmarkFn: () => {
						const someChangedContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: 0,
							summaryPath: "",
						};
						someChangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: someChangedContext,
						});
					},
				});
			}
		});
	});

	describe("summary size", () => {
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

		describe("for regular summaries", () => {
			for (const itemCount of itemCounts) {
				const benchmarkType = isInPerformanceTestingMode
					? BenchmarkType.Measurement
					: BenchmarkType.Perspective;

				// Baseline summary
				const baselineContext: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};

				const baselineSummarizer = setupForestForIncrementalSummarization(
					createInitialBoard(itemCount),
					{
						jsonValidator: FormatValidatorBasic,
						minVersionForCollab: FluidClientVersion.v2_73, // Necessary to force pre incremental summarization
					},
				).forestSummarizer;

				benchmarkCustom({
					type: benchmarkType,
					title: `baseline (${itemCount} items)`,
					run: (reporter) => {
						const summaryTree = baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: baselineContext,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});
			}
		});

		describe("for incremental summaries", () => {
			for (const itemCount of itemCounts) {
				const benchmarkType = isInPerformanceTestingMode
					? BenchmarkType.Measurement
					: BenchmarkType.Perspective;

				const baselineSummarizer = setupForestForIncrementalSummarization(
					createInitialBoard(itemCount),
				).forestSummarizer;

				benchmarkCustom({
					type: benchmarkType,
					title: `baseline for (${itemCount} items)`,
					run: (reporter) => {
						const baselineContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						};
						const summaryTree = baselineSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: baselineContext,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});

				const unchangedSummarizer = setupForestForIncrementalSummarization(
					createInitialBoard(itemCount),
				).forestSummarizer;
				// First summary to establish baseline (not measured)
				const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				unchangedSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext,
				});

				benchmarkCustom({
					type: benchmarkType,
					title: `unchanged for (${itemCount} items)`,
					run: (reporter) => {
						const unchangedContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: 0,
							summaryPath: "",
						};
						const summaryTree = unchangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: unchangedContext,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});

				const { checkout, forestSummarizer: someChangedSummarizer } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount));
				// First summary to establish baseline (not measured)
				const someChangedBaselineContext: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				someChangedSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: someChangedBaselineContext,
				});
				// Simulate 10% of items changing (not timed)
				updateItems(checkout, itemCount);

				benchmarkCustom({
					type: benchmarkType,
					title: `10% changes for (${itemCount} items)`,
					run: (reporter) => {
						const someChangedContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: 0,
							summaryPath: "",
						};
						const summaryTree = someChangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: someChangedContext,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});
			}
		});
	});
});
