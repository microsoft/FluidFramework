/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { ReferenceType } from "@fluidframework/merge-tree";
import { IntervalCollection, IntervalType, SequenceInterval } from "../intervalCollection";

/**
 * Note: Merge-tree has a number of perf tests for core operations (insert, remove, annotate).
 *
 * This file contains only interval perf tests currently, but addition to the suite should take
 * consideration to balance against existing merge-tree perf tests to avoid duplication.
 */

function runFindOverlappingIntervalsBenchmark({
	intervalCount,
	segmentCount,
	segmentLength,
}: {
	intervalCount: number;
	segmentCount: number;
	segmentLength: number;
}) {
	let sharedString: SharedString;
	let intervalCollection: IntervalCollection<SequenceInterval>;

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
			intervalCollection.add(
				intervalWidth * (2 * i),
				intervalWidth * (2 * i + 1),
				IntervalType.SlideOnRemove,
			);
		}
	};

	benchmark({
		title: `findOverlappingIntervals on string of length ${
			segmentCount * segmentLength
		} with ${intervalCount} equally spaced intervals and ${segmentCount} segments`,
		type: BenchmarkType.Measurement,
		benchmarkFn: () => {
			const start = (segmentLength * segmentCount) / 2;
			const end = start + segmentLength;
			intervalCollection.findOverlappingIntervals(start, end);
		},
		before: setupSharedString,
	});

	benchmark({
		title: `findOverlappingIntervals on string of length ${
			segmentCount * segmentLength
		} with ${intervalCount} equally spaced intervals and ${segmentCount} segments with endpoint resolution`,
		type: BenchmarkType.Perspective,
		benchmarkFn: () => {
			const start = (segmentLength * segmentCount) / 2;
			const end = start + segmentLength;
			for (const interval of intervalCollection.findOverlappingIntervals(start, end)) {
				sharedString.localReferencePositionToPosition(interval.start);
				sharedString.localReferencePositionToPosition(interval.end);
			}
		},
		before: setupSharedString,
	});
}

describe.only("SharedString perf", () => {
	describe("IntervalCollection", () => {
		describe("findOverlappingIntervals", () => {
			runFindOverlappingIntervalsBenchmark({
				intervalCount: 200,
				segmentCount: 1000,
				segmentLength: 250,
			});

			runFindOverlappingIntervalsBenchmark({
				intervalCount: 200,
				segmentCount: 1000 * 250,
				segmentLength: 1,
			});

			runFindOverlappingIntervalsBenchmark({
				intervalCount: 2000,
				segmentCount: 1000,
				segmentLength: 250,
			});
		});
	});
});
