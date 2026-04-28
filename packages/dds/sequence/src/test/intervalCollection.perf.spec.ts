/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import type { ISequenceIntervalCollection } from "../intervalCollection.js";
import {
	createOverlappingIntervalsIndex,
	type ISequenceOverlappingIntervalsIndex,
} from "../intervalIndex/index.js";
import { SharedString, SharedStringFactory } from "../sequenceFactory.js";

/**
 * Note: Merge-tree has a number of perf tests for core operations (insert, remove, annotate).
 *
 * Addition to the suite should take consideration to balance against existing merge-tree perf tests
 * to avoid duplication.
 */

function runFindOverlappingIntervalsBenchmark({
	intervalCount,
	segmentCount,
	segmentLength,
	type = BenchmarkType.Measurement,
}: {
	intervalCount: number;
	segmentCount: number;
	segmentLength: number;
	type?: BenchmarkType;
}) {
	let sharedString: SharedString;
	let intervalCollection: ISequenceIntervalCollection;
	let overlappingIntervalsIndex: ISequenceOverlappingIntervalsIndex;

	const setupSharedString = () => {
		sharedString = new SharedStringFactory().create(new MockFluidDataStoreRuntime(), "id");
		for (let i = 0; i < segmentCount; i++) {
			sharedString.insertText(0, "a".repeat(segmentLength));
			if (i % 2 === 0) {
				// Annotating every other segment prevents zamboni appending adjacent segments.
				sharedString.annotateRange(0, segmentLength, { foo: true });
			}
		}
		intervalCollection = sharedString.getIntervalCollection("ranges");
		const intervalWidth = (segmentCount * segmentLength) / intervalCount / 2;
		for (let i = 0; i < intervalCount; i++) {
			intervalCollection.add({
				start: intervalWidth * (2 * i),
				end: intervalWidth * (2 * i + 1),
			});
		}
		// Create and attach the overlapping interval index
		overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
		intervalCollection.attachIndex(overlappingIntervalsIndex);
	};

	benchmarkIt({
		title: `findOverlappingIntervals on string of length ${
			segmentCount * segmentLength
		} with ${intervalCount} equally spaced intervals and ${segmentCount} segments`,
		type,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				setupSharedString();
				const rangeStart = (segmentLength * segmentCount) / 2;
				const rangeEnd = rangeStart + segmentLength;
				state.timeAllBatches(() => {
					overlappingIntervalsIndex.findOverlappingIntervals(rangeStart, rangeEnd);
				});
			},
		}),
	});

	// Note: this test would likely be covered by a suite of local reference perf tests. In lieu of that,
	// it simulates flows that some consumers might use involving resolving the endpoints of their sequence intervals.
	benchmarkIt({
		title: `findOverlappingIntervals on string of length ${
			segmentCount * segmentLength
		} with ${intervalCount} equally spaced intervals and ${segmentCount} segments with endpoint resolution`,
		type: BenchmarkType.Perspective,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				setupSharedString();
				const rangeStart = (segmentLength * segmentCount) / 2;
				const rangeEnd = rangeStart + segmentLength;
				state.timeAllBatches(() => {
					for (const interval of overlappingIntervalsIndex.findOverlappingIntervals(
						rangeStart,
						rangeEnd,
					)) {
						sharedString.localReferencePositionToPosition(interval.start);
						sharedString.localReferencePositionToPosition(interval.end);
					}
				});
			},
		}),
	});
}

describe("IntervalCollection perf", () => {
	describe("findOverlappingIntervals", () => {
		runFindOverlappingIntervalsBenchmark({
			intervalCount: 200,
			segmentCount: 100,
			segmentLength: 250,
		});

		runFindOverlappingIntervalsBenchmark({
			intervalCount: 200,
			segmentCount: 100 * 250,
			segmentLength: 1,
			type: BenchmarkType.Perspective,
		});

		runFindOverlappingIntervalsBenchmark({
			intervalCount: 2000,
			segmentCount: 100,
			segmentLength: 250,
			type: BenchmarkType.Perspective,
		});
	});
});
