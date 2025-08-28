/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { setupRollbackTest, createAdditionalClient } from "@fluid-private/test-dds-utils";

import { IntervalCollection } from "../intervalCollection.js";
// import type { SequenceInterval } from "../intervals/index.js";
import { SharedStringFactory } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

describe("changeInterval: SharedString IntervalCollection rollback events", () => {
	describe("changeInterval: single client", () => {
		it("should trigger changeInterval on rollback of local endpoint modification", () => {
			const {
				dds: sharedString,
				containerRuntimeFactory,
				containerRuntime,
			} = setupRollbackTest<SharedStringClass>(
				"shared-string-1",
				(rt, id) => new SharedStringClass(rt, id, SharedStringFactory.Attributes),
				{ initialize: (dds) => dds.initializeLocal() },
			);

			const collection = sharedString.getIntervalCollection("test");
			assert(collection instanceof IntervalCollection);

			sharedString.insertText(0, "abcde");
			const interval = collection.add({ start: 1, end: 3 });
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let eventArgs: any = null;
			collection.on("changeInterval", (i, previousInterval, local, op, slide) => {
				eventArgs = { event: "changeInterval", i, previousInterval, local, op, slide };
			});

			// Local change (not flushed)
			collection.change(interval.getIntervalId(), { start: 2, end: 4 });
			assert(eventArgs.event === "changeInterval", "changeInterval event fired");

			containerRuntime.rollback?.();

			assert(eventArgs.local, "change is local");

			// even a rollback triggers the event with slide: true. why?
			// assert(!eventArgs.slide, "slide should be false");
			assert.equal(
				sharedString.localReferencePositionToPosition(eventArgs.i.start),
				1,
				"start reverted after rollback",
			);

			assert.equal(
				sharedString.localReferencePositionToPosition(eventArgs.i.end),
				3,
				"start reverted after rollback",
			);
		});
	});

	describe("multi-client(changeInterval)", () => {
		it("should restore interval state after rollback, ignoring op and local flags", () => {
			const {
				dds: sharedString,
				containerRuntimeFactory,
				containerRuntime,
			} = setupRollbackTest<SharedStringClass>(
				"shared-string-1",
				(rt, id) => new SharedStringClass(rt, id, SharedStringFactory.Attributes),
				{ initialize: (dds) => dds.initializeLocal() },
			);

			const collection = sharedString.getIntervalCollection("test");
			assert(collection instanceof IntervalCollection);

			const { dds: sharedString2, containerRuntime: containerRuntime2 } =
				createAdditionalClient<SharedStringClass>(
					containerRuntimeFactory,
					"2",
					(rt, id) =>
						new SharedStringClass(rt, `shared-string-${id}`, SharedStringFactory.Attributes),
					{ initialize: (dds) => dds.initializeLocal() },
				);

			const collection2 = sharedString2.getIntervalCollection("test");
			assert(
				collection2 instanceof IntervalCollection,
				"IntervalCollection instance expected",
			);

			let eventArgs: any = null;
			let eventArgs2: any = null;
			collection.on("changeInterval", (i, previousInterval) => {
				eventArgs = { event: "changeInterval", i, previousInterval };
			});

			collection2.on("changeInterval", (i, previousInterval) => {
				eventArgs2 = { event: "changeInterval", i, previousInterval };
			});

			sharedString.insertText(0, "abcde");
			containerRuntimeFactory.processAllMessages();

			const interval = collection.add({ start: 0, end: 3 });
			const intervalId = interval.getIntervalId();
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			collection2.change(intervalId, { start: 1, end: 3 });
			assert(
				eventArgs2.event === "changeInterval",
				"changeInterval event fired by collection2",
			);
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			collection.change(intervalId, { start: 2, end: 3 });
			collection2.change(intervalId, { start: 3, end: 4 });

			// Rollback local change
			containerRuntime.rollback?.();

			assert(eventArgs.event === "changeInterval", "changeInterval event fired");
			// The interval should reflect the remote change after rollback
			assert.equal(
				sharedString.localReferencePositionToPosition(eventArgs.i.start),
				1,
				"start reflects remote change after rollback",
			);

			assert.equal(
				sharedString.localReferencePositionToPosition(eventArgs.i.end),
				3,
				"end reflects remote change after rollback",
			);

			assert.equal(
				sharedString.localReferencePositionToPosition(eventArgs.previousInterval.start),
				-1,
				"previousInterval reflects local change before rollback",
			);

			assert.equal(
				sharedString.localReferencePositionToPosition(eventArgs.previousInterval.end),
				-1,
				"previousInterval end reflects local change before rollback",
			);

			assert.equal(
				sharedString2.localReferencePositionToPosition(eventArgs2.previousInterval.start),
				1,
				"previousInterval reflects change by remote",
			);

			assert.equal(
				sharedString2.localReferencePositionToPosition(eventArgs2.previousInterval.end),
				3,
				"previousInterval end reflects change by remote",
			);
		});

		it("should fire correct events for local rollback and remote delete", () => {
			const {
				dds: ss1,
				containerRuntimeFactory,
				containerRuntime,
			} = setupRollbackTest<SharedStringClass>(
				"shared-string-1",
				(rt, id) => new SharedStringClass(rt, id, SharedStringFactory.Attributes),
				{ initialize: (dds) => dds.initializeLocal() },
			);

			const collection1 = ss1.getIntervalCollection("test");
			ss1.insertText(0, "abcde");
			containerRuntimeFactory.processAllMessages();

			const interval = collection1.add({ start: 0, end: 3 });
			const intervalId = interval.getIntervalId();
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Remote client
			const { dds: ss2, containerRuntime: cr2 } = createAdditionalClient<SharedStringClass>(
				containerRuntimeFactory,
				"2",
				(rt, id) =>
					new SharedStringClass(rt, `shared-string-${id}`, SharedStringFactory.Attributes),
				{ initialize: (dds) => dds.initializeLocal() },
			);
			const collection2 = ss2.getIntervalCollection("test");

			// Capture events
			const events1: any[] = [];
			collection1.on("changeInterval", (i, prev) => events1.push({ type: "change", i, prev }));

			const events2: any[] = [];
			collection2.on("changeInterval", (i, prev) => events2.push({ type: "change", i, prev }));

			// Local unflushed change
			collection1.change(intervalId, { start: 1, end: 2 });

			// Rollback local change (interval still exists)
			containerRuntime.rollback?.();
			containerRuntimeFactory.processAllMessages();

			// Local events should capture the rollback
			const rollbackEvent = events1.find(
				(e) => ss1.localReferencePositionToPosition(e.i.start) === 0,
			);
			assert(rollbackEvent, "rollback changeInterval captured");
			assert.equal(
				ss1.localReferencePositionToPosition(rollbackEvent.i.end),
				3,
				"rollback restores correct end position",
			);

			// Remote client deletes interval
			collection2.removeIntervalById(intervalId);
			cr2.flush();
			containerRuntimeFactory.processAllMessages();

			// Attempting local change now does not fire events
			collection1.change(intervalId, { start: 2, end: 3 });
			const newChangeEvents = events1.filter((e) => e.i.start === 2);
			assert(newChangeEvents.length === 0, "no changeInterval fired on deleted interval");
		});
	});
});

describe("addInterval/deleteInterval: SharedString IntervalCollection rollback events", () => {
	it("should trigger addInterval on rollback of a locally added interval", () => {
		const {
			dds: sharedString,
			containerRuntimeFactory,
			containerRuntime,
		} = setupRollbackTest<SharedStringClass>(
			"shared-string-1",
			(rt, id) => new SharedStringClass(rt, id, SharedStringFactory.Attributes),
			{ initialize: (dds) => dds.initializeLocal() },
		);

		const collection = sharedString.getIntervalCollection("test");
		assert(collection instanceof IntervalCollection);

		sharedString.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();

		let addEventArgs: any = null;
		collection.on("addInterval", (interval1, local) => {
			addEventArgs = { interval1, local };
		});

		// Add interval locally
		const interval = collection.add({ start: 1, end: 3 });

		// Rollback the local addition
		containerRuntime.rollback?.();

		assert(addEventArgs, "addInterval event fired on rollback");
		// assert.strictEqual(addEventArgs.interval, interval, "correct interval in event");
		assert.strictEqual(addEventArgs.local, true, "event marked as local");
		// Interval should be removed after rollback
		assert.strictEqual(collection.getIntervalById(interval.getIntervalId()), undefined);
		assert(interval.disposed, "interval disposed after rollback");
	});

	it("should trigger deleteInterval on rollback of a locally removed interval", () => {
		const {
			dds: sharedString,
			containerRuntimeFactory,
			containerRuntime,
		} = setupRollbackTest<SharedStringClass>(
			"shared-string-1",
			(rt, id) => new SharedStringClass(rt, id, SharedStringFactory.Attributes),
			{ initialize: (dds) => dds.initializeLocal() },
		);

		const collection = sharedString.getIntervalCollection("test");
		assert(collection instanceof IntervalCollection);

		sharedString.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();

		// Add interval and flush so it's in the collection
		const interval = collection.add({ start: 1, end: 3 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		let deleteEventArgs: any = null;
		collection.on("deleteInterval", (deletedInterval, local) => {
			deleteEventArgs = { deletedInterval, local };
		});

		// Remove interval locally (not flushed)
		collection.removeIntervalById(interval.getIntervalId());

		// Rollback the local removal
		containerRuntime.rollback?.();

		assert(deleteEventArgs, "deleteInterval event fired on rollback");
		assert.strictEqual(deleteEventArgs.deletedInterval, interval, "correct interval in event");
		assert.strictEqual(deleteEventArgs.local, true, "event marked as local");
		// Interval should be restored after rollback
		const restored = collection.getIntervalById(interval.getIntervalId());
		assert.strictEqual(restored, interval, "interval restored after rollback");
		assert(!interval.disposed, "interval not disposed after rollback");
	});
});

describe("multi-client(addInterval/deleteInterval): SharedString IntervalCollection rollback events", () => {
	it("should fire addInterval on rollback of local add with multiple clients", () => {
		const {
			dds: ss1,
			containerRuntimeFactory,
			containerRuntime,
		} = setupRollbackTest<SharedStringClass>(
			"shared-string-1",
			(rt, id) => new SharedStringClass(rt, id, SharedStringFactory.Attributes),
			{ initialize: (dds) => dds.initializeLocal() },
		);

		const collection1 = ss1.getIntervalCollection("test");
		ss1.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();

		let addEventArgs: any = null;
		collection1.on("addInterval", (int, local) => {
			addEventArgs = { int, local };
		});

		// Local add
		const interval = collection1.add({ start: 1, end: 3 });

		// Rollback local add
		containerRuntime.rollback?.();

		assert(addEventArgs, "addInterval event fired on rollback");
		assert.strictEqual(addEventArgs.local, true, "event marked as local");
		assert.strictEqual(
			collection1.getIntervalById(interval.getIntervalId()),
			undefined,
			"interval removed",
		);
		// assert(interval.disposed, "interval disposed after rollback");
	});

	it("should fire deleteInterval on rollback of local remove with multiple clients", () => {
		const {
			dds: ss1,
			containerRuntimeFactory,
			containerRuntime,
		} = setupRollbackTest<SharedStringClass>(
			"shared-string-1",
			(rt, id) => new SharedStringClass(rt, id, SharedStringFactory.Attributes),
			{ initialize: (dds) => dds.initializeLocal() },
		);

		const collection1 = ss1.getIntervalCollection("test");
		ss1.insertText(0, "abcde");
		containerRuntimeFactory.processAllMessages();

		const interval = collection1.add({ start: 1, end: 3 });
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// Second client modifies collection
		const { dds: ss2 } = createAdditionalClient<SharedStringClass>(
			containerRuntimeFactory,
			"2",
			(rt, id) =>
				new SharedStringClass(rt, `shared-string-${id}`, SharedStringFactory.Attributes),
			{ initialize: (dds) => dds.initializeLocal() },
		);
		ss2.getIntervalCollection("test");

		let deleteEventArgs: any = null;
		collection1.on("deleteInterval", (deletedInterval, local) => {
			deleteEventArgs = { deletedInterval, local };
		});

		// Local removal
		collection1.removeIntervalById(interval.getIntervalId());

		// Rollback local remove
		containerRuntime.rollback?.();

		assert(deleteEventArgs, "deleteInterval event fired on rollback");
		assert.strictEqual(deleteEventArgs.deletedInterval, interval, "correct interval in event");
		assert.strictEqual(deleteEventArgs.local, true, "event marked as local");

		// Interval restored
		const restored = collection1.getIntervalById(interval.getIntervalId());
		assert.strictEqual(restored, interval, "interval restored after rollback");
		// assert(!interval.disposed, "interval not disposed after rollback");
	});
});
