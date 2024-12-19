/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { PropertySet, segmentIsRemoved } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { IIntervalCollection } from "../intervalCollection.js";
import { SequenceInterval } from "../intervals/index.js";
import { SharedStringFactory } from "../sequenceFactory.js";
import { SharedStringClass, ISharedString } from "../sharedString.js";

interface IntervalEventInfo {
	interval: { start: number; end: number };
	local: boolean;
	op: ISequencedDocumentMessage | undefined;
}

describe("SharedString interval collection event spec", () => {
	let sharedString: ISharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;

	let sharedString2: ISharedString;
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	let collection: IIntervalCollection<SequenceInterval>;

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime();
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

		// Create and connect a second SharedString.
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const services2 = {
			deltaConnection: dataStoreRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		sharedString2 = new SharedStringClass(
			dataStoreRuntime2,
			"shared-string-2",
			SharedStringFactory.Attributes,
		);
		sharedString2.initializeLocal();
		sharedString2.connect(services2);

		sharedString.insertText(0, "hello world");
		collection = sharedString.getIntervalCollection("test");
		containerRuntimeFactory.processAllMessages();
	});

	describe("addInterval", () => {
		const eventLog: IntervalEventInfo[] = [];
		beforeEach(() => {
			collection.on("addInterval", ({ start, end }, local, op) =>
				eventLog.push({
					interval: {
						start: sharedString.localReferencePositionToPosition(start),
						end: sharedString.localReferencePositionToPosition(end),
					},
					local,
					op,
				}),
			);
			eventLog.length = 0;
		});

		it("is emitted on initial local add but not ack of that add", () => {
			collection.add({ start: 0, end: 1 });
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, local, op }] = eventLog;
				assert.deepEqual(interval, { start: 0, end: 1 });
				assert.equal(local, true);
				assert.equal(op, undefined);
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});

		it("is emitted on ack of a remote add", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.add({ start: 0, end: 1 });
			assert.equal(eventLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, local, op }] = eventLog;
				assert.deepEqual(interval, { start: 0, end: 1 });
				assert.equal(local, false);
				assert.equal((op?.contents as { type?: unknown }).type, "act");
			}
		});
	});

	describe("deleteInterval", () => {
		const eventLog: IntervalEventInfo[] = [];
		let intervalId: string;
		beforeEach(() => {
			collection.on("deleteInterval", ({ start, end }, local, op) =>
				eventLog.push({
					interval: {
						start: sharedString.localReferencePositionToPosition(start),
						end: sharedString.localReferencePositionToPosition(end),
					},
					local,
					op,
				}),
			);
			const interval = collection.add({ start: 0, end: 1 });
			intervalId = interval.getIntervalId() ?? assert.fail("Expected interval to have id");
			containerRuntimeFactory.processAllMessages();
			eventLog.length = 0;
		});

		it("is emitted on initial local delete but not ack of that delete", () => {
			collection.removeIntervalById(intervalId);
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, local, op }] = eventLog;
				assert.deepEqual(interval, { start: 0, end: 1 });
				assert.equal(local, true);
				assert.equal(op, undefined);
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});

		it("is emitted on ack of a remote delete", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.removeIntervalById(intervalId);
			assert.equal(eventLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, local, op }] = eventLog;
				assert.deepEqual(interval, { start: 0, end: 1 });
				assert.equal(local, false);
				assert.equal((op?.contents as { type?: unknown }).type, "act");
			}
		});
	});

	describe("changeInterval", () => {
		const eventLog: (IntervalEventInfo & {
			previousEndpoints: { start: number; end: number };
			previousInterval: SequenceInterval;
			slide: boolean;
		})[] = [];
		let intervalId: string;
		beforeEach(() => {
			collection.on("changeInterval", ({ start, end }, previousInterval, local, op, slide) =>
				eventLog.push({
					interval: {
						start: sharedString.localReferencePositionToPosition(start),
						end: sharedString.localReferencePositionToPosition(end),
					},
					previousEndpoints: {
						start: sharedString.localReferencePositionToPosition(previousInterval.start),
						end: sharedString.localReferencePositionToPosition(previousInterval.end),
					},
					previousInterval,
					local,
					op,
					slide,
				}),
			);
			const _intervalId = collection.add({ start: 0, end: 1 }).getIntervalId();
			assert(_intervalId);
			intervalId = _intervalId;
			containerRuntimeFactory.processAllMessages();
			eventLog.length = 0;
		});

		it("is emitted on initial local change but not ack of that change", () => {
			collection.change(intervalId, { start: 2, end: 3 });
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, previousEndpoints, local, op, slide }] = eventLog;
				assert.deepEqual(interval, { start: 2, end: 3 });
				assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
				assert.equal(local, true);
				assert.equal(op, undefined);
				assert.equal(slide, false);
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});

		it("is emitted on a remote change", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.change(intervalId, { start: 2, end: 3 });
			assert.equal(eventLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, previousEndpoints, local, op, slide }] = eventLog;
				assert.deepEqual(interval, { start: 2, end: 3 });
				assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
				assert.equal(local, false);
				assert.equal((op?.contents as { type?: unknown }).type, "act");
				assert.equal(slide, false);
			}
		});

		it("is not emitted on a property change", () => {
			collection.change(intervalId, { props: { foo: "bar" } });
			assert.equal(eventLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 0);
		});

		it("is emitted on change of properties and endpoints", () => {
			collection.change(intervalId, { start: 2, end: 3, props: { foo: "bar" } });
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, previousEndpoints, local, op, slide }] = eventLog;
				assert.deepEqual(interval, { start: 2, end: 3 });
				assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
				assert.equal(local, true);
				assert.equal(op, undefined);
				assert.equal(slide, false);
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});

		describe("is emitted on a change due to an endpoint sliding", () => {
			it("on ack of a segment remove containing a ref", () => {
				sharedString.removeRange(1, 3);
				assert.equal(eventLog.length, 0);
				containerRuntimeFactory.processAllMessages();
				assert.equal(eventLog.length, 1);
				{
					const [{ interval, previousInterval, previousEndpoints, local, op, slide }] =
						eventLog;
					assert.deepEqual(interval, { start: 0, end: 1 });
					const segment = previousInterval.end.getSegment();
					assert(segment !== undefined);
					assert(segmentIsRemoved(segment) === false);
					assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
					assert.equal(local, true);
					assert.equal(op, undefined);
					assert.equal(slide, true);
				}
			});

			it("on ack of an add to a concurrently removed segment", () => {
				sharedString2.removeRange(3, sharedString2.getLength());
				collection.add({ start: 4, end: 4 });
				assert.equal(eventLog.length, 0);
				containerRuntimeFactory.processAllMessages();
				assert.equal(eventLog.length, 1);
				{
					const [{ interval, previousInterval, previousEndpoints, local, op, slide }] =
						eventLog;
					assert.deepEqual(interval, { start: 2, end: 2 });
					const segment = previousInterval.start.getSegment();
					assert(segment !== undefined);
					assert(segmentIsRemoved(segment) === false); // Note: this isn't 4 because we're interpreting the segment+offset from the current view.
					assert.deepEqual(previousEndpoints, { start: 3, end: 3 });
					assert.equal(local, true);
					assert.equal((op?.contents as { type?: unknown }).type, "act");
					assert.equal(slide, true);
				}
			});

			it("on ack of a change to a concurrently removed segment", () => {
				sharedString2.removeRange(3, sharedString2.getLength());
				collection.change(intervalId, { start: 4, end: 4 });
				assert.equal(eventLog.length, 1);
				containerRuntimeFactory.processAllMessages();
				assert.equal(eventLog.length, 2);
				{
					const { interval, previousInterval, previousEndpoints, local, op, slide } =
						eventLog[1];
					assert.deepEqual(interval, { start: 2, end: 2 });
					const segment = previousInterval.start.getSegment();
					assert(segment !== undefined);
					assert(segmentIsRemoved(segment) === false); // Note: this isn't 4 because we're interpreting the segment+offset from the current view.
					assert.deepEqual(previousEndpoints, { start: 3, end: 3 });
					assert.equal(local, true);
					assert.equal((op?.contents as { type?: unknown }).type, "act");
					assert.equal(slide, true);
				}
			});
		});
	});

	describe("propertyChanged", () => {
		const eventLog: (Omit<IntervalEventInfo, "interval"> & {
			id: string;
			deltas: PropertySet;
		})[] = [];
		let intervalId: string;
		beforeEach(() => {
			collection.on("propertyChanged", (interval, deltas, local, op) =>
				eventLog.push({
					id: interval.getIntervalId() ?? assert.fail("Expected interval to have id"),
					deltas,
					local,
					op,
				}),
			);
			intervalId =
				collection.add({ start: 0, end: 1, props: { initialProp: "baz" } }).getIntervalId() ??
				fail("Expected interval to have id");
			containerRuntimeFactory.processAllMessages();
			eventLog.length = 0;
		});

		it("is emitted on initial local property change but not ack of that change", () => {
			collection.change(intervalId, { props: { foo: "bar" } });
			assert.equal(eventLog.length, 1);
			{
				const [{ id, deltas, local, op }] = eventLog;
				assert.equal(id, intervalId);
				assert.equal(local, true);
				assert.equal(op, undefined);
				assert.deepEqual(deltas, { foo: null });
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});

		it("is emitted on ack of remote property change", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.change(intervalId, { props: { foo: "bar" } });
			assert.equal(eventLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
			{
				const [{ id, deltas, local, op }] = eventLog;
				assert.equal(id, intervalId);
				assert.equal(local, false);
				assert.equal((op?.contents as { type?: unknown }).type, "act");
				assert.deepEqual(deltas, { foo: null });
			}
		});

		it("only includes deltas for values that actually changed", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.change(intervalId, { props: { applies: true, conflictedDoesNotApply: 5 } });
			assert.equal(eventLog.length, 0);
			collection.change(intervalId, { props: { conflictedDoesNotApply: 2 } });
			assert.equal(eventLog.length, 1);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 2);
			{
				const { id, deltas, local, op } = eventLog[1];
				assert.equal(id, intervalId);
				assert.equal(local, false);
				assert.equal((op?.contents as { type?: unknown }).type, "act");
				assert.deepEqual(deltas, { applies: null });
			}
		});
		it("is emitted on change of properties and endpoints", () => {
			collection.change(intervalId, { start: 2, end: 3, props: { foo: "bar" } });
			assert.equal(eventLog.length, 1);
			{
				const [{ id, deltas, local, op }] = eventLog;
				assert.equal(id, intervalId);
				assert.equal(local, true);
				assert.equal(op, undefined);
				assert.deepEqual(deltas, { foo: null });
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});
	});

	describe("changed", () => {
		const eventLog: (Omit<IntervalEventInfo, "op"> & {
			id: string;
			deltas: PropertySet;
			previousEndpoints: { start: number; end: number } | undefined;
			previousInterval: SequenceInterval | undefined;
			slide: boolean;
		})[] = [];
		let intervalId: string;
		beforeEach(() => {
			collection.on("changed", (interval, deltas, previousInterval, local, slide) =>
				eventLog.push({
					id: interval.getIntervalId() ?? assert.fail("Expected interval to have id"),
					deltas,
					previousEndpoints: previousInterval
						? {
								start: sharedString.localReferencePositionToPosition(previousInterval.start),
								end: sharedString.localReferencePositionToPosition(previousInterval.end),
							}
						: undefined,
					previousInterval: previousInterval ?? undefined,
					interval: {
						start: sharedString.localReferencePositionToPosition(interval.start),
						end: sharedString.localReferencePositionToPosition(interval.end),
					},
					local,
					slide,
				}),
			);
			intervalId =
				collection.add({ start: 0, end: 1, props: { initialProp: "baz" } }).getIntervalId() ??
				fail("Expected interval to have id");
			containerRuntimeFactory.processAllMessages();
			eventLog.length = 0;
		});

		it("is emitted on initial local change but not ack of that change", () => {
			collection.change(intervalId, { start: 2, end: 3 });
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, previousEndpoints, previousInterval, local, slide }] = eventLog;
				assert.notEqual(previousInterval, undefined);
				assert.deepEqual(interval, { start: 2, end: 3 });
				assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
				assert.equal(local, true);
				assert.equal(slide, false);
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});

		it("is emitted on a remote change", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.change(intervalId, { start: 2, end: 3 });
			assert.equal(eventLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
			{
				const [{ interval, previousEndpoints, local, slide }] = eventLog;
				assert.deepEqual(interval, { start: 2, end: 3 });
				assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
				assert.equal(local, false);
				assert.equal(slide, false);
			}
		});

		it("is emitted on change of properties and endpoints", () => {
			collection.change(intervalId, { start: 2, end: 3, props: { foo: "bar" } });
			// for now: allow both events to be logged (in endpoint path and props path)
			assert.equal(eventLog.length, 2);
			{
				const [{ interval, previousEndpoints, local, slide }] = eventLog;
				assert.deepEqual(interval, { start: 2, end: 3 });
				assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
				assert.equal(local, true);
				assert.equal(slide, false);
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 2);
		});

		describe("is emitted on a change due to an endpoint sliding", () => {
			it("on ack of a segment remove containing a ref", () => {
				sharedString.removeRange(1, 3);
				assert.equal(eventLog.length, 0);
				containerRuntimeFactory.processAllMessages();
				assert.equal(eventLog.length, 1);
				{
					const [{ interval, previousInterval, previousEndpoints, local, slide }] = eventLog;
					assert.deepEqual(interval, { start: 0, end: 1 });
					assert(previousInterval !== undefined);
					const segment = previousInterval.end.getSegment();
					assert(segment !== undefined);
					assert(segmentIsRemoved(segment) === false);
					assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
					assert.equal(local, true);
					assert.equal(slide, true);
				}
			});

			it("on ack of an add to a concurrently removed segment", () => {
				sharedString2.removeRange(3, sharedString2.getLength());
				collection.add({ start: 4, end: 4 });
				assert.equal(eventLog.length, 0);
				containerRuntimeFactory.processAllMessages();
				assert.equal(eventLog.length, 1);
				{
					const [{ interval, previousInterval, previousEndpoints, local, slide }] = eventLog;
					assert.deepEqual(interval, { start: 2, end: 2 });
					assert(previousInterval !== undefined);
					const segment = previousInterval.start.getSegment();
					assert(segment !== undefined);
					assert(segmentIsRemoved(segment) === false);
					// Note: this isn't 4 because we're interpreting the segment+offset from the current view.
					assert.deepEqual(previousEndpoints, { start: 3, end: 3 });
					assert.equal(local, true);
					assert.equal(slide, true);
				}
			});

			it("on ack of a change to a concurrently removed segment", () => {
				sharedString2.removeRange(3, sharedString2.getLength());
				collection.change(intervalId, { start: 4, end: 4 });
				assert.equal(eventLog.length, 1);
				containerRuntimeFactory.processAllMessages();
				assert.equal(eventLog.length, 2);
				{
					const { interval, previousInterval, previousEndpoints, local, slide } = eventLog[1];
					assert.deepEqual(interval, { start: 2, end: 2 });
					assert(previousInterval !== undefined);
					const segment = previousInterval.start.getSegment();
					assert(segment !== undefined);
					assert(segmentIsRemoved(segment) === false); // Note: this isn't 4 because we're interpreting the segment+offset from the current view.
					assert.deepEqual(previousEndpoints, { start: 3, end: 3 });
					assert.equal(local, true);
					assert.equal(slide, true);
				}
			});
		});

		it("is emitted on initial local property change but not ack of that change", () => {
			collection.change(intervalId, { props: { foo: "bar" } });
			assert.equal(eventLog.length, 1);
			{
				const [{ previousInterval, id, deltas, local }] = eventLog;
				assert.equal(previousInterval, undefined);
				assert.equal(id, intervalId);
				assert.equal(local, true);
				assert.deepEqual(deltas, { foo: null });
			}
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
		});

		it("is emitted on ack of remote property change", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.change(intervalId, { props: { foo: "bar" } });
			assert.equal(eventLog.length, 0);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 1);
			{
				const [{ id, deltas, previousInterval, local }] = eventLog;
				assert.equal(previousInterval, undefined);
				assert.equal(id, intervalId);
				assert.equal(local, false);
				assert.deepEqual(deltas, { foo: null });
			}
		});

		it("only includes deltas for values that actually changed", () => {
			const collection2 = sharedString2.getIntervalCollection("test");
			collection2.change(intervalId, { props: { applies: true, conflictedDoesNotApply: 5 } });
			assert.equal(eventLog.length, 0);
			collection.change(intervalId, { props: { conflictedDoesNotApply: 2 } });
			assert.equal(eventLog.length, 1);
			containerRuntimeFactory.processAllMessages();
			assert.equal(eventLog.length, 2);
			{
				const { id, deltas, previousInterval, local } = eventLog[1];
				assert.equal(previousInterval, undefined);
				assert.equal(id, intervalId);
				assert.equal(local, false);
				assert.deepEqual(deltas, { applies: null });
			}
		});
	});
});
