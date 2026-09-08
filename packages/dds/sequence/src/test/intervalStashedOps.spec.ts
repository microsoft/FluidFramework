/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "node:assert";

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
	const actual = [...intervalCollection];
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

	describe("round-trip via applyStashedOp", () => {
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

		function assertIntervalMatches(
			scenario: string,
			target: SharedString,
			replayed: SequenceIntervalClass | undefined,
			source: SharedString,
			expected: SequenceIntervalClass,
		): void {
			assert(replayed !== undefined, `${scenario}: expected replayed interval`);
			assert.equal(
				target.localReferencePositionToPosition(replayed.start),
				source.localReferencePositionToPosition(expected.start),
				`${scenario}: start position mismatch`,
			);
			assert.equal(
				target.localReferencePositionToPosition(replayed.end),
				source.localReferencePositionToPosition(expected.end),
				`${scenario}: end position mismatch`,
			);
			assert.equal(replayed.startSide, expected.startSide, `${scenario}: startSide mismatch`);
			assert.equal(replayed.endSide, expected.endSide, `${scenario}: endSide mismatch`);
			assert.equal(
				replayed.stickiness,
				expected.stickiness,
				`${scenario}: stickiness mismatch`,
			);
		}

		function assertAddRoundTrip(
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
			assertIntervalMatches("add", target, replayed, source, sourceInterval);
		}

		function assertChangeRoundTrip(
			intervalStickinessEnabled: boolean,
			addArgs: Parameters<ISequenceIntervalCollection["add"]>[0],
			changeArgs: Parameters<ISequenceIntervalCollection["change"]>[1],
		): void {
			const source = createSharedString(intervalStickinessEnabled);
			const target = createSharedString(intervalStickinessEnabled);
			source.insertText(0, "hello world");
			target.insertText(0, "hello world");

			const sourceCollection = source.getIntervalCollection(label);
			const initial = sourceCollection.add(addArgs) as SequenceIntervalClass;
			const id = initial.getIntervalId();

			const targetCollection = target.getIntervalCollection(label);
			target["applyStashedOp"]({
				key: label,
				type: "act",
				value: { opName: IntervalOpType.ADD, value: initial.serialize() },
			} satisfies IMapOperation);

			const changed = sourceCollection.change(id, changeArgs) as SequenceIntervalClass;
			target["applyStashedOp"]({
				key: label,
				type: "act",
				value: {
					opName: IntervalOpType.CHANGE,
					value: changed.serializeDelta({ props: undefined, includeEndpoints: true }),
				},
			} satisfies IMapOperation);

			const [replayed] = Array.from(targetCollection) as SequenceIntervalClass[];
			assertIntervalMatches("change", target, replayed, source, changed);
		}

		describe("add", () => {
			it("non-sticky interval with intervalStickinessEnabled disabled", () => {
				assertAddRoundTrip(false, { start: 0, end: 5 });
			});

			it("non-sticky interval with intervalStickinessEnabled enabled", () => {
				assertAddRoundTrip(true, { start: 0, end: 5 });
			});

			it("sticky interval with intervalStickinessEnabled enabled", () => {
				assertAddRoundTrip(true, {
					start: "start",
					end: { pos: 5, side: Side.After },
				});
			});
		});

		describe("change", () => {
			it("non-sticky endpoints with intervalStickinessEnabled disabled", () => {
				assertChangeRoundTrip(false, { start: 0, end: 5 }, { start: 2, end: 7 });
			});

			it("non-sticky endpoints with intervalStickinessEnabled enabled", () => {
				assertChangeRoundTrip(true, { start: 0, end: 5 }, { start: 2, end: 7 });
			});

			it("sticky endpoints with intervalStickinessEnabled enabled", () => {
				assertChangeRoundTrip(
					true,
					{ start: "start", end: { pos: 5, side: Side.After } },
					{ start: "start", end: { pos: 7, side: Side.After } },
				);
			});
		});

		describe("stickiness gate", () => {
			// Symmetric negative-guard: a genuinely sticky serialized op must
			// still trip assertStickinessEnabled when the target has the flag off.
			// Guards against a future "always strip sides on replay" simplification
			// silently weakening the feature gate.
			it("sticky serialized op replayed against intervalStickinessEnabled=false throws", () => {
				const source = createSharedString(true);
				const target = createSharedString(false);
				source.insertText(0, "hello world");
				target.insertText(0, "hello world");

				const sourceCollection = source.getIntervalCollection(label);
				const sticky = sourceCollection.add({
					start: "start",
					end: { pos: 5, side: Side.After },
				}) as SequenceIntervalClass;
				target.getIntervalCollection(label);

				assert.throws(
					() =>
						target["applyStashedOp"]({
							key: label,
							type: "act",
							value: { opName: IntervalOpType.ADD, value: sticky.serialize() },
						} satisfies IMapOperation),
					/intervalStickinessEnabled/,
				);
			});
		});
	});
});
