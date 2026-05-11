/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import { Side } from "@fluidframework/merge-tree/internal";
import { IntervalType } from "@fluidframework/sequence-previous/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { ISequenceIntervalCollection } from "../intervalCollection.js";
import type { IMapOperation } from "../intervalCollectionMap.js";
import { IntervalOpType, SequenceIntervalClass } from "../intervals/index.js";
import { SharedStringFactory, type SharedString } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

const assertIntervals = (
	sharedString: SharedString,
	intervalCollection: ISequenceIntervalCollection,
	expected: readonly { start: number; end: number }[],
	validateOverlapping: boolean = true,
) => {
	const actual = Array.from(intervalCollection);
	if (validateOverlapping && sharedString.getLength() > 0) {
		const overlapping = intervalCollection.findOverlappingIntervals(
			0,
			sharedString.getLength() - 1,
		);
		assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
	}
	assert.strictEqual(
		actual.length,
		expected.length,
		`findOverlappingIntervals() must return the expected number of intervals`,
	);

	const actualPos = actual.map((interval) => {
		assert(interval);
		const start = sharedString.localReferencePositionToPosition(interval.start);
		const end = sharedString.localReferencePositionToPosition(interval.end);
		return { start, end };
	});
	assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

describe("Interval Stashed Ops on client ", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedStringClass(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		// Connect the first SharedString.
		dataStoreRuntime1.setAttachState(AttachState.Attached);
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);
	});

	describe("applyStashedOp", () => {
		let collection: ISequenceIntervalCollection;
		let intervalId: string;
		const label = "test";
		let startingInterval;
		beforeEach(() => {
			sharedString.insertText(0, "hello world");
			collection = sharedString.getIntervalCollection(label);
			startingInterval = {
				start: 0,
				end: 5,
				sequenceNumber: sharedString.getCurrentSeq(),
				intervalType: IntervalType.SlideOnRemove,
			};
			intervalId = collection.add(startingInterval).getIntervalId();
		});
		it("for add interval", () => {
			const interval = {
				start: 5,
				end: 10,
				sequenceNumber: sharedString.getCurrentSeq(),
				intervalType: 2,
			};
			const opArgs: IMapOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.ADD,
					value: interval,
				},
			};

			sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [
				{ start: 0, end: 5 },
				{ start: 5, end: 10 },
			]);
		});
		it("for delete interval", () => {
			const opArgs: IMapOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.DELETE,
					value: {
						properties: { intervalId },
						sequenceNumber: sharedString.getCurrentSeq(),
						intervalType: 2,
					},
				},
			};
			sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, []);
			assert.equal(collection.getIntervalById(intervalId), undefined);
		});
		it("for change interval", () => {
			const opArgs: IMapOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.CHANGE,
					value: {
						start: 5,
						end: 10,
						properties: { intervalId },
						sequenceNumber: sharedString.getCurrentSeq(),
						intervalType: 2,
					},
				},
			};
			sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [{ start: 5, end: 10 }]);
		});
		it("for interval property change", () => {
			const interval = collection.getIntervalById(intervalId);
			assert(interval !== undefined);
			const opArgs: IMapOperation = {
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.CHANGE,
					value: {
						properties: { intervalId, a: 2 },
						sequenceNumber: sharedString.getCurrentSeq(),
						intervalType: 2,
					},
				},
			};
			sharedString["applyStashedOp"](opArgs);
			assertIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
			assert.equal(interval.properties.a, 2);
		});
	});

	describe("round-trip add via applyStashedOp", () => {
		const label = "test";

		function createSharedString(intervalStickinessEnabled: boolean): SharedString {
			const runtime = new MockFluidDataStoreRuntime({ clientId: "rt" });
			runtime.options = { intervalStickinessEnabled };
			runtime.setAttachState(AttachState.Attached);
			const factory = new MockContainerRuntimeFactory();
			factory.createContainerRuntime(runtime);
			const ss = new SharedStringClass(runtime, "ss", SharedStringFactory.Attributes);
			ss.initializeLocal();
			ss.connect({
				deltaConnection: runtime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			return ss;
		}

		function assertRoundTrip(
			intervalStickinessEnabled: boolean,
			addArgs: Parameters<ISequenceIntervalCollection["add"]>[0],
		): void {
			const source = createSharedString(intervalStickinessEnabled);
			const target = createSharedString(intervalStickinessEnabled);
			source.insertText(0, "hello world");
			target.insertText(0, "hello world");

			const sourceCollection = source.getIntervalCollection(label);
			const sourceInterval = sourceCollection.add(addArgs) as SequenceIntervalClass;

			const targetCollection = target.getIntervalCollection(label);
			target["applyStashedOp"]({
				key: label,
				type: "act",
				value: { opName: IntervalOpType.ADD, value: sourceInterval.serialize() },
			} satisfies IMapOperation);

			const [replayed] = Array.from(targetCollection) as SequenceIntervalClass[];
			assert(replayed !== undefined, "expected replayed interval");
			assert.equal(
				target.localReferencePositionToPosition(replayed.start),
				source.localReferencePositionToPosition(sourceInterval.start),
				"start position mismatch",
			);
			assert.equal(
				target.localReferencePositionToPosition(replayed.end),
				source.localReferencePositionToPosition(sourceInterval.end),
				"end position mismatch",
			);
			assert.equal(replayed.startSide, sourceInterval.startSide, "startSide mismatch");
			assert.equal(replayed.endSide, sourceInterval.endSide, "endSide mismatch");
			assert.equal(replayed.stickiness, sourceInterval.stickiness, "stickiness mismatch");
		}

		it("non-sticky interval with intervalStickinessEnabled disabled", () => {
			assertRoundTrip(false, { start: 0, end: 5 });
		});

		it("non-sticky interval with intervalStickinessEnabled enabled", () => {
			assertRoundTrip(true, { start: 0, end: 5 });
		});

		it("sticky interval with intervalStickinessEnabled enabled", () => {
			assertRoundTrip(true, {
				start: "start",
				end: { pos: 5, side: Side.After },
			});
		});
	});
});
