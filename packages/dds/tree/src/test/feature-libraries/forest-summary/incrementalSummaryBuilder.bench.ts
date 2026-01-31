/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import {
	type TreeChunk,
	defaultIncrementalEncodingPolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/index.js";
import {
	ForestIncrementalSummaryBuilder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/incrementalSummaryBuilder.js";
import {
	summaryContentBlobKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/summaryFormatV3.js";
import { configureBenchmarkHooks } from "../../utils.js";

import {
	createMockIncrementalSummaryContext,
	getMockChunk,
	incrementalSummaryTestConstants,
} from "./incrementalSummaryBuilder.spec.js";

const {
	testCursor,
	stringify,
	mockForestSummaryRootContent,
	mockEncodedChunk,
	initialSequenceNumber,
} = incrementalSummaryTestConstants;

/**
 * Creates multiple unique mock chunks for testing scenarios with many chunks.
 */
function createMockChunks(count: number): TreeChunk[] {
	const chunks: TreeChunk[] = [];
	for (let i = 0; i < count; i++) {
		// Each chunk needs to be a unique object for identity-based tracking
		chunks.push({ referenceAdded: () => {}, id: i } as unknown as TreeChunk);
	}
	return chunks;
}

/**
 * Creates a ForestIncrementalSummaryBuilder that cycles through the provided chunks.
 */
function createBuilder(chunks: TreeChunk[]): ForestIncrementalSummaryBuilder {
	let chunkIndex = 0;
	return new ForestIncrementalSummaryBuilder(
		true,
		() => {
			const chunk = chunks[chunkIndex];
			chunkIndex = (chunkIndex + 1) % chunks.length;
			return [chunk];
		},
		defaultIncrementalEncodingPolicy,
		initialSequenceNumber,
	);
}

/**
 * Runs a summary with the specified configuration.
 */
function runSummary(
	builder: ForestIncrementalSummaryBuilder,
	chunkCount: number,
	fullTree: boolean,
	summarySequenceNumber: number,
	latestSummarySequenceNumber: number,
): void {
	const incrementalSummaryContext = createMockIncrementalSummaryContext(
		summarySequenceNumber,
		latestSummarySequenceNumber,
	);
	const summaryTreeBuilder = new SummaryTreeBuilder();
	builder.startSummary({
		fullTree,
		incrementalSummaryContext,
		stringify,
		builder: summaryTreeBuilder,
	});

	for (let i = 0; i < chunkCount; i++) {
		builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
	}

	builder.completeSummary({
		incrementalSummaryContext,
		forestSummaryRootContent: mockForestSummaryRootContent,
		forestSummaryRootContentKey: summaryContentBlobKey,
		builder: summaryTreeBuilder,
	});
}

// Scale test parameters based on performance testing mode
const chunkCounts = isInPerformanceTestingMode ? [10, 100, 1000] : [10, 100];

describe("Incremental Summary Builder benchmarks", () => {
	configureBenchmarkHooks();

	describe("Full vs Incremental summarization comparison", () => {
		for (const chunkCount of chunkCounts) {
			const benchmarkType =
				chunkCount >= 100 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

			// Baseline: Full tree summary
			let fullTreeBuilder: ForestIncrementalSummaryBuilder;
			benchmark({
				type: benchmarkType,
				title: `Full tree summary with ${chunkCount} chunks`,
				before: () => {
					const chunks = createMockChunks(chunkCount);
					fullTreeBuilder = createBuilder(chunks);
				},
				benchmarkFn: () => {
					runSummary(fullTreeBuilder, chunkCount, true, 10, 0);
				},
			});

			// Incremental: Summary with handle reuse (after initial summary)
			let incrementalBuilder: ForestIncrementalSummaryBuilder;
			benchmark({
				type: benchmarkType,
				title: `Incremental summary with ${chunkCount} unchanged chunks`,
				before: () => {
					const chunks = createMockChunks(chunkCount);
					incrementalBuilder = createBuilder(chunks);
					// First summary to establish baseline (not measured)
					runSummary(incrementalBuilder, chunkCount, false, 10, 0);
				},
				benchmarkFn: () => {
					runSummary(incrementalBuilder, chunkCount, false, 20, 10);
				},
			});

			// Mixed scenario: Some chunks changed, some unchanged
			let mixedBuilder: ForestIncrementalSummaryBuilder;
			let mixedChunks: TreeChunk[];
			benchmark({
				type: benchmarkType,
				title: `Incremental summary with ${chunkCount} chunks (10% changed)`,
				before: () => {
					mixedChunks = createMockChunks(chunkCount);
					mixedBuilder = createBuilder(mixedChunks);
					// First summary to establish baseline
					runSummary(mixedBuilder, chunkCount, false, 10, 0);
					// Simulate 10% of chunks changing
					for (let i = 0; i < chunkCount; i++) {
						if (i % 10 === 0) {
							mixedChunks[i] = getMockChunk() as TreeChunk & { id: number };
						}
					}
				},
				benchmarkFn: () => {
					runSummary(mixedBuilder, chunkCount, false, 20, 10);
				},
			});
		}
	});

	describe("Repeated summary cycles", () => {
		const summaryCycleCount = isInPerformanceTestingMode ? 10 : 5;

		for (const chunkCount of chunkCounts) {
			const benchmarkType =
				chunkCount >= 100 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

			// Full tree summaries repeated (worst case baseline)
			let fullTreeCycleBuilder: ForestIncrementalSummaryBuilder;
			benchmark({
				type: benchmarkType,
				title: `${summaryCycleCount} full tree summaries with ${chunkCount} chunks`,
				before: () => {
					const chunks = createMockChunks(chunkCount);
					fullTreeCycleBuilder = createBuilder(chunks);
				},
				benchmarkFn: () => {
					for (let cycle = 0; cycle < summaryCycleCount; cycle++) {
						runSummary(fullTreeCycleBuilder, chunkCount, true, (cycle + 1) * 10, cycle * 10);
					}
				},
			});

			// Incremental summaries repeated (optimized path)
			let incrementalCycleBuilder: ForestIncrementalSummaryBuilder;
			benchmark({
				type: benchmarkType,
				title: `${summaryCycleCount} incremental summaries with ${chunkCount} unchanged chunks`,
				before: () => {
					const chunks = createMockChunks(chunkCount);
					incrementalCycleBuilder = createBuilder(chunks);
				},
				benchmarkFn: () => {
					for (let cycle = 0; cycle < summaryCycleCount; cycle++) {
						runSummary(
							incrementalCycleBuilder,
							chunkCount,
							false,
							(cycle + 1) * 10,
							cycle * 10,
						);
					}
				},
			});

			// Incremental summaries with 10% changes each cycle (realistic scenario)
			let mixedCycleBuilder: ForestIncrementalSummaryBuilder;
			let mixedCycleChunks: TreeChunk[];
			benchmark({
				type: benchmarkType,
				title: `${summaryCycleCount} incremental summaries with ${chunkCount} chunks (10% change per cycle)`,
				before: () => {
					mixedCycleChunks = createMockChunks(chunkCount);
					mixedCycleBuilder = createBuilder(mixedCycleChunks);
				},
				benchmarkFn: () => {
					for (let cycle = 0; cycle < summaryCycleCount; cycle++) {
						// Simulate 10% of chunks changing each cycle
						if (cycle > 0) {
							for (let i = 0; i < chunkCount; i++) {
								if (i % 10 === cycle % 10) {
									mixedCycleChunks[i] = getMockChunk() as TreeChunk & { id: number };
								}
							}
						}
						runSummary(mixedCycleBuilder, chunkCount, false, (cycle + 1) * 10, cycle * 10);
					}
				},
			});
		}
	});
});
