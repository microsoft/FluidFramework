/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { type ISequenceIntervalCollection } from "../intervalCollection.js";
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
	type,
}: {
	intervalCount: number;
	segmentCount: number;
	segmentLength: number;
	type: BenchmarkType;
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

	benchmark({
		title: `findOverlappingIntervals on string of length ${
			segmentCount * segmentLength
		} with ${intervalCount} equally spaced intervals and ${segmentCount} segments`,
		type,
		benchmarkFn: () => {
			const start = (segmentLength * segmentCount) / 2;
			const end = start + segmentLength;
			overlappingIntervalsIndex.findOverlappingIntervals(start, end);
		},
		before: setupSharedString,
	});

	// Note: this test would likely be covered by a suite of local reference perf tests. In lieu of that,
	// it simulates flows that some consumers might use involving resolving the endpoints of their sequence intervals.
	benchmark({
		title: `findOverlappingIntervals on string of length ${
			segmentCount * segmentLength
		} with ${intervalCount} equally spaced intervals and ${segmentCount} segments with endpoint resolution`,
		type: BenchmarkType.Perspective,
		benchmarkFn: () => {
			const start = (segmentLength * segmentCount) / 2;
			const end = start + segmentLength;
			for (const interval of overlappingIntervalsIndex.findOverlappingIntervals(start, end)) {
				sharedString.localReferencePositionToPosition(interval.start);
				sharedString.localReferencePositionToPosition(interval.end);
			}
		},
		before: setupSharedString,
	});
}

describe("IntervalCollection perf", () => {
	describe("findOverlappingIntervals", () => {
		runFindOverlappingIntervalsBenchmark({
			intervalCount: 200,
			segmentCount: 100,
			segmentLength: 250,
			type: BenchmarkType.Measurement,
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
