/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { IIntervalCollection, IntervalType, SequenceInterval } from "../intervalCollection";
import {
	appendChangeIntervalToRevertibles,
	appendSharedStringDeltaToRevertibles,
	SharedStringRevertible,
} from "../revertibles";

describe("Interval revertible perf", () => {
	describe("Move interval", () => {
		let collection: IIntervalCollection<SequenceInterval>;
		let interval: SequenceInterval;
	
		const setUp = (enableRevertibles: boolean) => {
			const runtime = new MockFluidDataStoreRuntime();
			runtime.options = { mergeTreeUseNewLengthCalculations: true };
			const factory = new SharedStringFactory();
			const sharedString = factory.create(runtime, "id");
			sharedString.insertText(0, "a".repeat(100));
			collection = sharedString.getIntervalCollection("test");
			interval = collection.add(45, 77, IntervalType.SlideOnRemove);
			if (enableRevertibles) {
				collection.on("changeInterval", (i, previousInterval, local, op) => {
					const revertibles: SharedStringRevertible[] = [];
					appendChangeIntervalToRevertibles(sharedString, i, previousInterval, revertibles);
				});
			}
		};

		const execute = () => {
			collection.change(interval.getIntervalId(), 1, 2);
		};

		benchmark({
			beforeEachBatch: () => {
				setUp(false);
			},
			type: BenchmarkType.Perspective,
			title: "without revertible",
			benchmarkFn: () => {
				execute();
			},
		});

		benchmark({
			beforeEachBatch: () => {
				setUp(true);
			},
			type: BenchmarkType.Measurement,
			title: "with revertible",
			benchmarkFn: () => {
				execute();
			},
		});
	});

	describe("Add and remove range with interval and moved interval", () => {
		let sharedString: SharedString;
		let collection: IIntervalCollection<SequenceInterval>;
		let interval: SequenceInterval;

		const setUp = (enableRevertibles: boolean) => {
			const runtime = new MockFluidDataStoreRuntime();
			runtime.options = { mergeTreeUseNewLengthCalculations: true };
			const factory = new SharedStringFactory();
			sharedString = factory.create(runtime, "id");
			sharedString.insertText(0, "abc");
			collection = sharedString.getIntervalCollection("test");
			interval = collection.add(1, 2, IntervalType.SlideOnRemove);
			if (enableRevertibles) {
				const revertibles: SharedStringRevertible[] = [];
				collection.on("changeInterval", (i, previousInterval, local, op) => {
					appendChangeIntervalToRevertibles(sharedString, i, previousInterval, revertibles);
				});
				sharedString.on("sequenceDelta", (op) => {
					appendSharedStringDeltaToRevertibles(sharedString, op, revertibles);
				});
			}
		};

		const execute = () => {
			// add text to end
			sharedString.insertText(3, "abc");
			// create interval in segment to be removed
			collection.add(1, 2, IntervalType.SlideOnRemove);
			// move existing interval to cause local refs from move revertible
			collection.change(interval.getIntervalId(), 4, 5);
			// delete range
			sharedString.removeRange(0, 3);
		};

		benchmark({
			type: BenchmarkType.Perspective,
			title: "without revertible",
			beforeEachBatch: () => {
				setUp(false);
			},
			benchmarkFn: () => {
				execute();
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: "with revertible",
			beforeEachBatch: () => {
				setUp(true);
			},
			benchmarkFn: () => {
				execute();
			},
		});
	});
});
