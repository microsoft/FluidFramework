/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import { IntervalType } from "@fluidframework/sequence-previous/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { type ISequenceIntervalCollection } from "../intervalCollection.js";
import type { IMapOperation } from "../intervalCollectionMap.js";
import { IntervalOpType } from "../intervals/index.js";
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
});
