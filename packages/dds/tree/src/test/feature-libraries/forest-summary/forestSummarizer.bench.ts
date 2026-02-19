/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	BenchmarkType,
	type IMeasurementReporter,
	benchmark,
	benchmarkCustom,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";

import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import type { ForestSummarizer } from "../../../feature-libraries/index.js";
import type { TreeCheckout } from "../../../shared-tree/index.js";
import { TreeViewConfiguration } from "../../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

import {
	Root,
	createInitialBoard,
	setupForestForIncrementalSummarization,
} from "./forestSummarizerTestUtils.js";

describe.skip("Forest Summarizer benchmarks", () => {
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
					item.data = `Updated data 10`;
				}
			}
		}
	}

	describe("summarization performance", () => {
		// Regular summary benchmarks are only done once to provide a baseline for incremental summary performance.
		// They do not have corresponding unchanged and 10% changed benchmarks because they will always fully summarize and be the same.
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
					title: `baseline: non-incremental summary with (${itemCount} items)`,
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

				let baselineIncrementalSummarizer: ForestSummarizer;
				benchmark({
					type: benchmarkType,
					title: `baseline: incremental summary for (${itemCount} items)`,
					before: () => {
						const { forestSummarizer } = setupForestForIncrementalSummarization(
							createInitialBoard(itemCount),
						);
						baselineIncrementalSummarizer = forestSummarizer;
					},
					benchmarkFn: () => {
						const baselineContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						};
						baselineIncrementalSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: baselineContext,
						});
					},
				});

				let unchangedSummarizer: ForestSummarizer;
				const unchangedContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				benchmark({
					type: benchmarkType,
					title: `unchanged for (${itemCount} items)`,
					before: () => {
						const { forestSummarizer } = setupForestForIncrementalSummarization(
							createInitialBoard(itemCount),
						);
						unchangedSummarizer = forestSummarizer;
						// First summary to establish baseline (not measured)
						unchangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: unchangedContext1,
						});
					},
					benchmarkFn: () => {
						const unchangedContext2: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: unchangedContext1.summarySequenceNumber,
							summaryPath: "",
						};
						unchangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: unchangedContext2,
						});
					},
				});

				let someChangedSummarizer: ForestSummarizer;
				const someChangedContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				benchmark({
					type: benchmarkType,
					title: `10% changes for (${itemCount} items)`,
					before: () => {
						const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
							createInitialBoard(itemCount),
						);
						someChangedSummarizer = forestSummarizer;
						// First summary to establish baseline (not measured)
						someChangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: someChangedContext1,
						});
						// Simulate 10% of items changing (not timed)
						updateItems(checkout, itemCount);
					},
					benchmarkFn: () => {
						const someChangedContext2: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: someChangedContext1.summarySequenceNumber,
							summaryPath: "",
						};
						someChangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: someChangedContext2,
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
		function measureSummarySize(summaryTree: object, reporter: IMeasurementReporter): void {
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			reporter.addMeasurement("summarySize (bytes)", summarySize);
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

				const { forestSummarizer: baselineSummarizer } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount), {
						jsonValidator: FormatValidatorBasic,
						minVersionForCollab: FluidClientVersion.v2_73, // Necessary to force pre incremental summarization
					});

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

				const { forestSummarizer: unchangedSummarizer } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount));
				// First summary to establish baseline (not measured)
				const unchangedContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				unchangedSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: unchangedContext1,
				});

				benchmarkCustom({
					type: benchmarkType,
					title: `unchanged for (${itemCount} items)`,
					run: (reporter) => {
						const unchangedContext2: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: unchangedContext1.summarySequenceNumber,
							summaryPath: "",
						};
						const summaryTree = unchangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: unchangedContext2,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});

				const { checkout, forestSummarizer: someChangedSummarizer } =
					setupForestForIncrementalSummarization(createInitialBoard(itemCount));
				// First summary to establish baseline (not measured)
				const someChangedContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				someChangedSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: someChangedContext1,
				});
				// Simulate 10% of items changing (not timed)
				updateItems(checkout, itemCount);

				benchmarkCustom({
					type: benchmarkType,
					title: `10% changes for (${itemCount} items)`,
					run: (reporter) => {
						const someChangedContext2: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: someChangedContext1.summarySequenceNumber,
							summaryPath: "",
						};
						const summaryTree = someChangedSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: someChangedContext2,
						});
						measureSummarySize(summaryTree, reporter);
					},
				});
			}
		});
	});
});
