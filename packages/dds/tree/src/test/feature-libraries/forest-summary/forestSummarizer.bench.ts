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

import type { ForestSummarizer } from "../../../feature-libraries/index.js";
import { TreeViewConfiguration } from "../../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

import {
	createInitialBoard,
	Root,
	setupForestForIncrementalSummarization,
} from "./forestSummarizerTestUtils.js";

describe("Forest Summarizer benchmarks", () => {
	// Scale test parameters based on performance testing mode
	const itemCounts = isInPerformanceTestingMode ? [1000, 10000, 50000] : [10, 100, 1000];

	configureBenchmarkHooks();

	describe("Incremental summarization performance", () => {
		for (const itemCount of itemCounts) {
			const benchmarkType =
				itemCount >= 100 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

			// Non-incremental: Full summarization without handle reuse
			let baselineSummarizer: ForestSummarizer;
			benchmark({
				type: benchmarkType,
				title: `Initial summary with ${itemCount} items`,
				before: () => {
					const { forestSummarizer } = setupForestForIncrementalSummarization(
						createInitialBoard(itemCount),
					);
					baselineSummarizer = forestSummarizer;
				},
				benchmarkFn: () => {
					baselineSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						},
					});
				},
			});

			// Incremental with no changes
			let incrementalSummarizer: ForestSummarizer;
			benchmark({
				type: benchmarkType,
				title: `Incremental summary with ${itemCount} unchanged items`,
				before: () => {
					const { forestSummarizer } = setupForestForIncrementalSummarization(
						createInitialBoard(itemCount),
					);
					incrementalSummarizer = forestSummarizer;
					// First summary to establish baseline (not measured)
					const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: 0,
						latestSummarySequenceNumber: -1,
						summaryPath: "",
					};
					incrementalSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext,
					});
				},
				benchmarkFn: () => {
					const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: 10,
						latestSummarySequenceNumber: 0,
						summaryPath: "",
					};
					incrementalSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext,
					});
				},
			});

			// Incremental with 10% changes
			benchmark({
				type: benchmarkType,
				title: `Incremental summary with ${itemCount} items (10%) changed`,
				benchmarkFnCustom: async (state) => {
					const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
						createInitialBoard(itemCount),
					);
					// First summary to establish baseline (not timed)
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						},
					});

					// Create view once before the loop
					const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
					const root = view.root;

					let summarySequenceNumber = 10;
					let running: boolean;
					do {
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

						const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber,
							latestSummarySequenceNumber: summarySequenceNumber - 10,
							summaryPath: "",
						};
						// Only time the actual summary operation
						running = state.timeBatch(() => {
							forestSummarizer.summarize({
								stringify: JSON.stringify,
								incrementalSummaryContext,
							});
						});
						summarySequenceNumber += 10;
					} while (running);
				},
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

			// Initial (full) summary size
			benchmarkCustom({
				type: benchmarkType,
				title: `Non-incremental summary size with ${itemCount} items`,
				run: async (reporter) => {
					const { forestSummarizer } = setupForestForIncrementalSummarization(
						createInitialBoard(itemCount),
					);
					const summaryTree = forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						},
					});
					measureSummarySize(summaryTree, reporter);
				},
			});

			// Incremental summary size with no changes
			benchmarkCustom({
				type: benchmarkType,
				title: `Incremental summary size with ${itemCount} unchanged items`,
				run: async (reporter) => {
					const { forestSummarizer } = setupForestForIncrementalSummarization(
						createInitialBoard(itemCount),
					);
					// First summary to establish baseline
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						},
					});
					// Second summary (incremental, no changes) - this is what we measure
					const summaryTree = forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: 0,
							summaryPath: "",
						},
					});
					measureSummarySize(summaryTree, reporter);
				},
			});

			// Incremental summary size with 10% changes
			benchmarkCustom({
				type: benchmarkType,
				title: `Incremental summary size with ${itemCount} items (10% changed)`,
				run: async (reporter) => {
					const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
						createInitialBoard(itemCount),
					);
					// First summary to establish baseline
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: 0,
							latestSummarySequenceNumber: -1,
							summaryPath: "",
						},
					});

					// Make 10% of items change
					const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
					const root = view.root;
					for (let i = 0; i < itemCount; i++) {
						if (i % 10 === 0) {
							const item = root.barArray.at(i);
							if (item !== undefined) {
								item.summary = `Updated summary 10`;
							}
						}
					}

					// Second summary (incremental, 10% changes) - this is what we measure
					const summaryTree = forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: 10,
							latestSummarySequenceNumber: 0,
							summaryPath: "",
						},
					});
					measureSummarySize(summaryTree, reporter);
				},
			});
		}
	});
});
