/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
	ReferenceType,
	SlidingPreference,
	reservedRangeLabelsKey,
} from "@fluidframework/merge-tree";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockStorage,
	MockEmptyDeltaConnection,
} from "@fluidframework/test-runtime-utils";
import { LoggingError } from "@fluidframework/telemetry-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { IIntervalCollection, Side } from "../intervalCollection";
import { IntervalIndex } from "../intervalIndex";
import { IntervalStickiness, SequenceInterval, ISerializableInterval } from "../intervals";
import { assertSequenceIntervals } from "./intervalTestUtils";

class MockIntervalIndex<TInterval extends ISerializableInterval>
	implements IntervalIndex<TInterval>
{
	private readonly intervals: TInterval[];
	constructor() {
		this.intervals = new Array<TInterval>();
	}

	public add(interval: TInterval) {
		this.intervals.push(interval);
	}

	public remove(interval: TInterval): boolean {
		const idx = this.intervals.indexOf(interval);
		if (idx !== -1) {
			this.intervals.splice(idx, 1);
			return true;
		}
		return false;
	}

	public get(idx: number): TInterval {
		return this.intervals[idx];
	}

	public size(): number {
		return this.intervals.length;
	}
}

function assertIntervalEquals(
	string: SharedString,
	interval: SequenceInterval | undefined,
	endpoints: { start: number; end: number },
): void {
	assert(interval);
	assert.equal(
		string.localReferencePositionToPosition(interval.start),
		endpoints.start,
		"mismatched start",
	);
	assert.equal(
		string.localReferencePositionToPosition(interval.end),
		endpoints.end,
		"mismatched end",
	);
}

describe("SharedString interval collections", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedString(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);
	});

	describe("in a connected state with a remote SharedString", () => {
		let sharedString2: SharedString;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();

			// Connect the first SharedString.
			dataStoreRuntime1.setAttachState(AttachState.Attached);
			dataStoreRuntime1.options = {
				intervalStickinessEnabled: true,
			};
			const containerRuntime1 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString.initializeLocal();
			sharedString.connect(services1);

			// Create and connect a second SharedString.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime({ clientId: "2" });
			const containerRuntime2 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			dataStoreRuntime2.options = {
				intervalStickinessEnabled: true,
			};
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			sharedString2 = new SharedString(
				dataStoreRuntime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			sharedString2.initializeLocal();
			sharedString2.connect(services2);
		});

		it("can maintain interval consistency", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "xyz");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");
			assert.notStrictEqual(collection2, undefined, "undefined");
			assert.strictEqual(sharedString.getText(), sharedString2.getText(), "not equal text");

			sharedString.insertText(0, "abc");
			const interval = collection1.add({ start: 1, end: 1 });
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			sharedString2.insertText(0, "wha");

			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedString.getText(), "whaabcxyz", "different text 1");
			assert.strictEqual(sharedString.getText(), "whaabcxyz", "different text 2");

			assertSequenceIntervals(sharedString, collection1, [{ start: 4, end: 4 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 4, end: 4 }]);

			collection2.change(intervalId, { start: 1, end: 6 });
			sharedString.removeText(0, 2);
			collection1.change(intervalId, { start: 0, end: 5 });

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection1, [{ start: 0, end: 5 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 5 }]);

			collection1.change(intervalId, {
				start: sharedString.getLength() - 1,
				end: sharedString.getLength() - 1,
			});

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection1, [
				{ start: sharedString.getLength() - 1, end: sharedString.getLength() - 1 },
			]);
			assertSequenceIntervals(sharedString2, collection2, [
				{ start: sharedString2.getLength() - 1, end: sharedString2.getLength() - 1 },
			]);
		});

		describe("changing endpoints and/or properties", () => {
			it("changes only endpoints with new signature", () => {
				const collection = sharedString.getIntervalCollection("test");
				sharedString.insertText(0, "hello world");
				const id = collection.add({ start: 0, end: 3, props: { a: 1 } }).getIntervalId();

				collection.change(id, { start: 1, end: 4 });

				assertIntervalEquals(sharedString, collection.getIntervalById(id), {
					start: 1,
					end: 4,
				});
				assert.equal(collection.getIntervalById(id)?.properties.a, 1);
			});
			it("changes only properties with new signature", () => {
				const collection = sharedString.getIntervalCollection("test");
				sharedString.insertText(0, "hello world");
				const id = collection.add({ start: 0, end: 3, props: { a: 1 } }).getIntervalId();

				collection.change(id, { props: { a: 2 } });

				assertIntervalEquals(sharedString, collection.getIntervalById(id), {
					start: 0,
					end: 3,
				});
				assert.equal(collection.getIntervalById(id)?.properties.a, 2);
			});
			it("changes endpoints and properties with new signature", () => {
				const collection = sharedString.getIntervalCollection("test");
				sharedString.insertText(0, "hello world");
				const id = collection.add({ start: 0, end: 3, props: { a: 1 } }).getIntervalId();

				collection.change(id, { start: 1, end: 4, props: { a: 2 } });

				assertIntervalEquals(sharedString, collection.getIntervalById(id), {
					start: 1,
					end: 4,
				});
				assert.equal(collection.getIntervalById(id)?.properties.a, 2);
			});
			it("changes endpoints and properties with new signature on a remote sharedString", () => {
				const collection = sharedString.getIntervalCollection("test");
				sharedString.insertText(0, "hello world");
				const id = collection.add({ start: 0, end: 3, props: { a: 1 } }).getIntervalId();
				containerRuntimeFactory.processAllMessages();

				const collection2 = sharedString2.getIntervalCollection("test");
				collection.change(id, { start: 1, end: 4, props: { a: 2 } });
				containerRuntimeFactory.processAllMessages();
				assertIntervalEquals(sharedString, collection.getIntervalById(id), {
					start: 1,
					end: 4,
				});
				assertIntervalEquals(sharedString2, collection2.getIntervalById(id), {
					start: 1,
					end: 4,
				});
				assert.equal(collection.getIntervalById(id)?.properties.a, 2);
				assert.equal(collection2.getIntervalById(id)?.properties.a, 2);
			});
			it("passes empty property set to change", () => {
				const collection = sharedString.getIntervalCollection("test");
				sharedString.insertText(0, "hello world");
				const id = collection.add({ start: 0, end: 3, props: { a: 1 } }).getIntervalId();

				collection.change(id, { props: {} });

				assertIntervalEquals(sharedString, collection.getIntervalById(id), {
					start: 0,
					end: 3,
				});
				assert.equal(collection.getIntervalById(id)?.properties.a, 1);
			});
			it("passes undefined endpoints and properties to change", () => {
				const collection = sharedString.getIntervalCollection("test");
				sharedString.insertText(0, "hello world");
				const id = collection.add({ start: 0, end: 3, props: { a: 1 } }).getIntervalId();

				collection.change(id, { start: undefined, end: undefined, props: undefined });

				assertIntervalEquals(sharedString, collection.getIntervalById(id), {
					start: 0,
					end: 3,
				});
				assert.equal(collection.getIntervalById(id)?.properties.a, 1);
			});
		});

		// Regression test for bug described in <https://dev.azure.com/fluidframework/internal/_workitems/edit/4477>
		//
		// This test involves a crash inside RBTree when multiple intervals slide
		// off the string
		//
		// More specifically, previously we didn't properly clear the segment
		// on local references which became detached, which caused crashes on
		// some IntervalCollection workflows
		it("passes regression test for #4477", () => {
			sharedString.insertText(0, "ABC");
			sharedString.insertText(0, "D");
			// DABC
			sharedString.removeRange(0, 1);
			// [D]ABC
			const collection = sharedString.getIntervalCollection("test");
			collection.add({ start: 0, end: 0, props: { intervalId: "x" } });
			//    x
			// [D]ABC
			sharedString.removeRange(0, 1);
			//     x
			// [D][A]BC
			collection.add({ start: 0, end: 0, props: { intervalId: "y" } });
			//     x y
			// [D][A]BC
			sharedString.removeRange(0, 1);
			sharedString.removeRange(0, 1);
			sharedString.insertText(0, "EFGHIJK");
			sharedString.insertText(0, "LMNO");
			containerRuntimeFactory.processAllMessages();
			sharedString.insertText(0, "P");
			// x, y are detached
			//                  [   ]
			// string is PLMNOEFGHIJK
			collection.add({ start: 7, end: 11, props: { intervalId: "z" } });
			sharedString.removeRange(11, 12);
			containerRuntimeFactory.processAllMessages();
		});

		describe("remain consistent on double-delete", () => {
			let collection: IIntervalCollection<SequenceInterval>;
			let collection2: IIntervalCollection<SequenceInterval>;
			beforeEach(() => {
				sharedString.insertText(0, "01234");
				collection = sharedString.getIntervalCollection("test");
				collection2 = sharedString2.getIntervalCollection("test");
				containerRuntimeFactory.processAllMessages();
			});

			it("causing references to slide forward", () => {
				sharedString2.removeRange(2, 3);
				collection.add({ start: 2, end: 2 });
				sharedString.removeRange(2, 4);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [{ start: 2, end: 2 }]);
				assertSequenceIntervals(sharedString2, collection2, [{ start: 2, end: 2 }]);
			});

			it("causing references to slide backward", () => {
				sharedString2.removeRange(2, 3);
				collection.add({ start: 2, end: 2 });
				sharedString.removeRange(2, 5);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 1 }]);
				assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 1 }]);
			});
		});

		it("errors creating invalid intervals", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();

			assert.throws(
				() => collection1.add({ start: 0, end: 0 }),
				"Should throw creating interval on empty string",
			);
			assert.throws(
				() => collection1.add({ start: 1, end: 3 }),
				"Should throw creating interval on empty string",
			);
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			assert.throws(
				() => collection1.add({ start: 2, end: 5 }),
				"Should throw creating interval past end of string",
			);
			// There is no check for creating an interval at a negative offset
			// assert.throws(() => collection1.add(-1, 2, IntervalType.SlideOnRemove),
			//     "Should throw creating interval at negative position");
		});

		it("can create and slide interval to a marker", () => {
			sharedString.insertText(0, "ABCD");
			sharedString.insertMarker(4, ReferenceType.Tile, { nodeType: "Paragraph" });
			const collection1 = sharedString.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			collection1.add({ start: 3, end: 4 });
			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection1, [{ start: 3, end: 4 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 3, end: 4 }]);

			sharedString.removeRange(3, 4);
			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection1, [{ start: 3, end: 3 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 3, end: 3 }]);
		});

		it("can slide intervals nearer", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			// Conflicting remove/add interval at end of string
			collection1.add({ start: 1, end: 3 });
			sharedString2.removeRange(3, 4);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 2 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 2 }]);

			// Remove location of end of interval
			sharedString.removeRange(2, 3);
			assert.equal(sharedString.getText(), "AB");
			assertSequenceIntervals(sharedString, collection1, [
				// odd behavior - end of interval doesn't slide
				// until ack, so position beyond end of string
				{ start: 1, end: 2 },
			]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 1 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 1 }]);

			// Remove location of start and end of interval
			sharedString.removeRange(1, 2);
			assertSequenceIntervals(
				sharedString,
				collection1,
				[
					// odd behavior - start of interval doesn't slide
					// until ack, so not found by overlapping search
					{ start: 1, end: 1 },
				],
				false,
			);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: 0, end: 0 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 0 }]);

			// Interval on empty string
			sharedString.removeRange(0, 1);
			assertSequenceIntervals(sharedString, collection1, [
				// Search finds interval at end of string
				{ start: 0, end: 0 },
			]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(
				sharedString,
				collection1,
				[
					// Interval becomes detached when string is acked empty
					{ start: -1, end: -1 },
				],
				false,
			);
			assertSequenceIntervals(sharedString2, collection2, [{ start: -1, end: -1 }], false);
		});

		it("remains consistent when a change to the same position but different segment is issued", () => {
			// This is a regression test for an issue in LocalIntervalCollection, which avoided actually modifying
			// intervals on change operations if it perceived them to already have the same position. That logic was
			// invalid in 2 ways:
			// 1. for remote ops, the position requested for change potentially refers to a different revision from
			//    the local position.
			// 2. for local ops, even if an interval appears to be at the position it's being changed to, it might
			//    actually be associated with a removed segment and pending slide. In this case, failing to update
			//    the interval locally but still emitting a change op causes inconsistent behavior, since subsequent
			//    slides may be to different segments (in this test, the danger is that the client issuing the change
			//    op may end up with their interval pointing to the "Y" if they fail to change it locally)
			sharedString.insertText(0, "ABCDE");
			const collection1 = sharedString.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();
			const interval = collection1.add({ start: 1, end: 3 });
			sharedString2.insertText(2, "XY");
			sharedString2.removeRange(1, 3);
			sharedString.removeRange(1, 4);
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection1.change(intervalId, { start: 1, end: 1 });
			containerRuntimeFactory.processAllMessages();
			assert.equal(sharedString.getText(), "AYE");
			assertSequenceIntervals(sharedString, collection1, [{ start: 2, end: 2 }]);
			assertSequenceIntervals(sharedString2, sharedString2.getIntervalCollection("test"), [
				{ start: 2, end: 2 },
			]);
		});

		it("can slide intervals nearer to locally removed segment", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			sharedString2.removeRange(3, 4);
			collection1.add({ start: 1, end: 3 });
			sharedString.removeRange(1, 3);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: 0, end: 0 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 0 }]);
		});

		it("consistent after remove all/insert text conflict", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			collection1.add({ start: 1, end: 3 });
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			sharedString.insertText(0, "XYZ");
			sharedString2.removeRange(0, 4);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: 2, end: 2 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 2, end: 2 }]);

			sharedString2.removeRange(0, 3);
			sharedString.insertText(0, "PQ");
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: -1, end: -1 }], false);
			assertSequenceIntervals(sharedString2, collection2, [{ start: -1, end: -1 }], false);

			sharedString2.removeRange(0, 2);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: -1, end: -1 }], false);
			assertSequenceIntervals(sharedString2, collection2, [{ start: -1, end: -1 }], false);
		});

		it("can slide intervals on remove ack", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			collection1.add({ start: 1, end: 3 });
			containerRuntimeFactory.processAllMessages();

			sharedString.insertText(2, "X");
			assert.strictEqual(sharedString.getText(), "ABXCD");
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 4 }]);

			sharedString2.removeRange(1, 2);
			assert.strictEqual(sharedString2.getText(), "ACD");
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 2 }]);

			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedString.getText(), "AXCD");
			assert.strictEqual(sharedString2.getText(), "AXCD");

			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 3 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 3 }]);
		});

		it("can slide intervals to segment not referenced by remove", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			sharedString.insertText(2, "X");
			assert.strictEqual(sharedString.getText(), "ABXCD");
			collection1.add({ start: 1, end: 3 });

			sharedString2.removeRange(1, 2);
			assert.strictEqual(sharedString2.getText(), "ACD");

			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedString.getText(), "AXCD");
			assert.strictEqual(sharedString2.getText(), "AXCD");

			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 2 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 2 }]);
		});

		it("can slide intervals on create ack", () => {
			// Create and connect a third SharedString.
			const dataStoreRuntime3 = new MockFluidDataStoreRuntime({ clientId: "3" });
			const containerRuntime3 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime3);
			const services3 = {
				deltaConnection: containerRuntime3.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			const sharedString3 = new SharedString(
				dataStoreRuntime3,
				"shared-string-3",
				SharedStringFactory.Attributes,
			);
			sharedString3.initializeLocal();
			sharedString3.connect(services3);

			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");
			const collection3 = sharedString3.getIntervalCollection("test");

			sharedString.removeRange(1, 2);
			assert.strictEqual(sharedString.getText(), "ACD");

			sharedString2.insertText(2, "X");
			assert.strictEqual(sharedString2.getText(), "ABXCD");

			collection3.add({ start: 1, end: 3 });

			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedString.getText(), "AXCD");
			assert.strictEqual(sharedString2.getText(), "AXCD");
			assert.strictEqual(sharedString3.getText(), "AXCD");

			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 3 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 3 }]);
			assertSequenceIntervals(sharedString3, collection3, [{ start: 1, end: 3 }]);
		});

		it("can slide intervals on change ack", () => {
			// Create and connect a third SharedString.
			const dataStoreRuntime3 = new MockFluidDataStoreRuntime({ clientId: "3" });
			const containerRuntime3 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime3);
			const services3 = {
				deltaConnection: containerRuntime3.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			const sharedString3 = new SharedString(
				dataStoreRuntime3,
				"shared-string-3",
				SharedStringFactory.Attributes,
			);
			sharedString3.initializeLocal();
			sharedString3.connect(services3);

			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			const interval = collection1.add({ start: 0, end: 0 });
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");
			const collection3 = sharedString3.getIntervalCollection("test");

			sharedString.removeRange(1, 2);
			assert.strictEqual(sharedString.getText(), "ACD");

			sharedString2.insertText(2, "X");
			assert.strictEqual(sharedString2.getText(), "ABXCD");

			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection3.change(intervalId, { start: 1, end: 3 });

			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedString.getText(), "AXCD");
			assert.strictEqual(sharedString2.getText(), "AXCD");
			assert.strictEqual(sharedString3.getText(), "AXCD");

			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 3 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 3 }]);
			assertSequenceIntervals(sharedString3, collection3, [{ start: 1, end: 3 }]);

			sharedString.removeRange(3, 4);
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 3 }]);
			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 2 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 2 }]);
			assertSequenceIntervals(sharedString3, collection3, [{ start: 1, end: 2 }]);
		});

		it("can slide intervals on create before remove", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			collection2.add({ start: 2, end: 3 });

			sharedString.removeRange(1, 3);

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 1 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 1 }]);
		});

		it("can slide intervals on remove before create", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCDE");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			sharedString.removeRange(1, 3);
			assert.strictEqual(sharedString.getText(), "ADE");

			collection2.add({ start: 1, end: 3 });

			containerRuntimeFactory.processAllMessages();

			// before fixing this, at this point the start range on sharedString
			// is on the removed segment. Can't detect that from the interval API.
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 1 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 1 }]);

			// More operations reveal the problem
			sharedString.insertText(2, "X");
			assert.strictEqual(sharedString.getText(), "ADXE");
			sharedString2.removeRange(1, 2);
			assert.strictEqual(sharedString2.getText(), "AE");

			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedString.getText(), "AXE");

			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 1 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 1 }]);
		});

		it("can maintain different offsets on removed segment", () => {
			const collection1 = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "ABCD");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			collection1.add({ start: 1, end: 3 });
			sharedString.insertText(2, "XY");
			assert.strictEqual(sharedString.getText(), "ABXYCD");

			sharedString2.removeRange(0, 4);
			assert.strictEqual(sharedString2.getText(), "");

			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedString.getText(), "XY");
			assert.strictEqual(sharedString2.getText(), "XY");

			assertSequenceIntervals(sharedString, collection1, [{ start: 0, end: 1 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 1 }]);
		});

		it("tolerates creation of an interval with no segment due to concurrent delete", () => {
			sharedString.insertText(0, "ABCDEF");
			const collection1 = sharedString.getIntervalCollection("test");
			const collection2 = sharedString2.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();
			sharedString2.removeRange(0, sharedString2.getLength());
			collection1.add({ start: 1, end: 1 });
			sharedString2.insertText(0, "X");
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: -1, end: -1 }], false);
			assertSequenceIntervals(sharedString2, collection2, [{ start: -1, end: -1 }], false);
		});

		it("can maintain consistency of LocalReference's when segments are packed", async () => {
			// sharedString.insertMarker(0, ReferenceType.Tile, { nodeType: "Paragraph" });

			const collection1 = sharedString.getIntervalCollection("test2");
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test2");

			sharedString.insertText(0, "a");
			sharedString.insertText(1, "b");
			sharedString.insertText(2, "c");
			sharedString.insertText(3, "d");
			sharedString.insertText(4, "e");
			sharedString.insertText(5, "f");

			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "abcdef", "incorrect text 1");
			assert.strictEqual(sharedString2.getText(), "abcdef", "incorrect text 2");

			collection1.add({ start: 2, end: 2 });

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection1, [{ start: 2, end: 2 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 2, end: 2 }]);

			sharedString.insertText(0, "a");
			sharedString.insertText(1, "b");
			sharedString.insertText(2, "c");
			sharedString.insertText(3, "d");
			sharedString.insertText(4, "e");
			sharedString.insertText(5, "f");

			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "abcdefabcdef", "incorrect text 2");
			assert.strictEqual(sharedString2.getText(), "abcdefabcdef", "incorrect text 3");

			collection1.add({ start: 5, end: 5 });
			collection1.add({ start: 2, end: 2 });

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection1, [
				{ start: 2, end: 2 },
				{ start: 5, end: 5 },
				{ start: 8, end: 8 },
			]);
			assertSequenceIntervals(sharedString2, collection2, [
				{ start: 2, end: 2 },
				{ start: 5, end: 5 },
				{ start: 8, end: 8 },
			]);

			// Summarize to cause Zamboni to pack segments. Confirm consistency after packing.
			await sharedString2.summarize();

			assertSequenceIntervals(sharedString, collection1, [
				{ start: 2, end: 2 },
				{ start: 5, end: 5 },
				{ start: 8, end: 8 },
			]);
			assertSequenceIntervals(sharedString2, collection2, [
				{ start: 2, end: 2 },
				{ start: 5, end: 5 },
				{ start: 8, end: 8 },
			]);
		});

		it("ignores remote changes that would be overridden by multiple local ones", () => {
			// The idea of this test is to verify multiple pending local changes are tracked accurately.
			// No tracking at all of pending changes would cause collection 1 to see all 5 values: 0, 1, 2, 3, 4.
			// Tracking that there is only a local change, but not which one it was might cause collection 1 to
			// see 4 values: 0, 2, 3, 4.
			// Correct tracking should cause collection1 to only see 3 values: 0, 2, 4
			sharedString.insertText(0, "ABCDEF");
			const collection1 = sharedString.getIntervalCollection("test");
			const endpointsForCollection1: { start: number; end: number }[] = [];
			const sequenceIntervalToEndpoints = (
				interval: SequenceInterval,
			): { start: number; end: number } => ({
				start: sharedString.localReferencePositionToPosition(interval.start),
				end: sharedString.localReferencePositionToPosition(interval.end),
			});

			collection1.on("addInterval", (interval) => {
				endpointsForCollection1.push(sequenceIntervalToEndpoints(interval));
			});
			collection1.on("changeInterval", (interval) => {
				const { start, end } = sequenceIntervalToEndpoints(interval);
				// IntervalCollection is a bit noisy when it comes to change events; this logic makes sure
				// to only append for actually changed values.
				const prevValue = endpointsForCollection1[endpointsForCollection1.length - 1];
				if (prevValue.start !== start || prevValue.end !== end) {
					endpointsForCollection1.push({ start, end });
				}
			});

			const id = collection1.add({ start: 0, end: 0 }).getIntervalId();
			assert(id);
			containerRuntimeFactory.processAllMessages();
			const collection2 = sharedString2.getIntervalCollection("test");

			collection2.change(id, { start: 1, end: 1 });
			collection1.change(id, { start: 2, end: 2 });

			assertIntervalEquals(sharedString2, collection2.getIntervalById(id), {
				start: 1,
				end: 1,
			});
			assertIntervalEquals(sharedString, collection1.getIntervalById(id), {
				start: 2,
				end: 2,
			});

			collection2.change(id, { start: 3, end: 3 });
			collection1.change(id, { start: 4, end: 4 });
			containerRuntimeFactory.processAllMessages();
			assert.deepEqual(endpointsForCollection1, [
				{ start: 0, end: 0 },
				{ start: 2, end: 2 },
				{ start: 4, end: 4 },
			]);
		});

		it("propagates delete op to second runtime", async () => {
			// Create and connect a second SharedString.
			const runtime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(runtime2);
			sharedString2 = new SharedString(
				runtime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			const services2: IChannelServices = {
				deltaConnection: runtime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString2.initializeLocal();
			sharedString2.connect(services2);

			sharedString.insertText(0, "hello friend");
			const collection1 = sharedString.getIntervalCollection("test");
			const collection2 = sharedString2.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();

			const interval = collection1.add({ start: 6, end: 8 }); // the "fr" in "friend"

			containerRuntimeFactory.processAllMessages();
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection1.removeIntervalById(intervalId);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, []);
		});

		it("can round trip intervals", async () => {
			sharedString.insertText(0, "ABCDEF");
			const collection1 = sharedString.getIntervalCollection("test");

			const id = collection1.add({ start: 2, end: 2 }).getIntervalId();
			assert(id);
			containerRuntimeFactory.processAllMessages();

			const summaryTree = await sharedString.summarize();

			const services: IChannelServices = {
				deltaConnection: new MockEmptyDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summaryTree.summary),
			};

			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			const sharedString3 = new SharedString(
				dataStoreRuntime2,
				"shared-string-3",
				SharedStringFactory.Attributes,
			);

			await sharedString3.load(services);
			await sharedString3.loaded;

			const collection2 = sharedString3.getIntervalCollection("test");

			assertIntervalEquals(sharedString, collection1.getIntervalById(id), {
				start: 2,
				end: 2,
			});
			assertIntervalEquals(sharedString3, collection2.getIntervalById(id), {
				start: 2,
				end: 2,
			});
		});

		describe("intervalCollection comparator consistency", () => {
			// This is a regression suite for an issue caught by fuzz testing:
			// if intervals A, B, C are created which initially compare A < B < C,
			// it's possible that string operations can change this order. Specifically,
			// removing substrings of text can make LocalReferences which previously compared
			// unequal now compare equal. Since the interval comparator is lexicographical on
			// the array [start reference, end reference, id], collapsing previously-unequal
			// references to now equal ones can cause issues.
			// The immediate way this manifests is that attempting to remove the interval fails
			// in red-black tree code, since the key isn't at the expected location.
			let collection: IIntervalCollection<SequenceInterval>;
			beforeEach(() => {
				sharedString.insertText(0, "ABCDEFG");
				collection = sharedString.getIntervalCollection("test");
			});

			it("retains intervalTree coherency when falling back to end comparison", () => {
				collection.add({ start: 1, end: 6 });
				collection.add({ start: 2, end: 5 });
				const initiallyLargest = collection.add({ start: 3, end: 4 });
				sharedString.removeRange(1, 4);
				// Interval slide doesn't happen until creation is acked, so interval sort order
				// is still by start position, which do not compare equal despite all appearing to be 1
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 3 },
					{ start: 1, end: 2 },
					{ start: 1, end: 1 },
				]);
				const initiallyLargestId = initiallyLargest.getIntervalId();
				assert(initiallyLargestId);
				collection.removeIntervalById(initiallyLargestId);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 3 },
					{ start: 1, end: 2 },
				]);
				containerRuntimeFactory.processAllMessages();
				// After processing messages, intervals slide and order is as expected.
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 2 },
					{ start: 1, end: 3 },
				]);
			});

			it("retains intervalTree coherency after slide when falling back to end comparison", () => {
				collection.add({ start: 1, end: 6 });
				collection.add({ start: 2, end: 5 });
				const initiallyLargest = collection.add({ start: 3, end: 4 });
				sharedString.removeRange(1, 4);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 3 },
					{ start: 1, end: 2 },
					{ start: 1, end: 1 },
				]);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 1 },
					{ start: 1, end: 2 },
					{ start: 1, end: 3 },
				]);
				const initiallyLargestId = initiallyLargest.getIntervalId();
				assert(initiallyLargestId);
				collection.removeIntervalById(initiallyLargestId);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 2 },
					{ start: 1, end: 3 },
				]);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 2 },
					{ start: 1, end: 3 },
				]);
			});

			it("retains intervalTree coherency when falling back to id comparison", () => {
				const [idLowest, idMiddle, idLargest] = ["a", "b", "c"];
				collection.add({ start: 0, end: 1, props: { intervalId: idLargest } });
				collection.add({ start: 0, end: 2, props: { intervalId: idMiddle } });
				collection.add({ start: 0, end: 3, props: { intervalId: idLowest } });
				sharedString.removeRange(1, 4);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
				]);
				collection.removeIntervalById(idLowest);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
				]);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
				]);
			});

			it("retains intervalTree coherency after slide when falling back to id comparison", () => {
				const [idLowest, idMiddle, idLargest] = ["a", "b", "c"];
				collection.add({ start: 0, end: 1, props: { intervalId: idLargest } });
				collection.add({ start: 0, end: 2, props: { intervalId: idMiddle } });
				collection.add({ start: 0, end: 3, props: { intervalId: idLowest } });
				sharedString.removeRange(1, 4);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
				]);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
				]);
				collection.removeIntervalById(idLowest);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
				]);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [
					{ start: 0, end: 1 },
					{ start: 0, end: 1 },
				]);
			});

			it("retains intervalTree coherency after slide on create ack", () => {
				// The code in createAck needs to change the reference positions for an interval.
				// The test verifies that is done correctly and that the listener is added
				// to fix the interval position on subsequent slide.
				containerRuntimeFactory.processAllMessages();
				collection.add({ start: 4, end: 4 });
				collection.add({ start: 4, end: 5 });

				sharedString2.removeRange(1, 2);

				const initiallySmallest = collection.add({ start: 1, end: 6 });

				sharedString2.removeRange(1, 3);

				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 6 },
					{ start: 4, end: 4 },
					{ start: 4, end: 5 },
				]);

				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 1 },
					{ start: 1, end: 2 },
					{ start: 1, end: 3 },
				]);
				const initiallySmallestId = initiallySmallest.getIntervalId();
				assert(initiallySmallestId);
				collection.removeIntervalById(initiallySmallestId);
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 1 },
					{ start: 1, end: 2 },
				]);
				containerRuntimeFactory.processAllMessages();
				assertSequenceIntervals(sharedString, collection, [
					{ start: 1, end: 1 },
					{ start: 1, end: 2 },
				]);
			});
		});

		it("test IntervalCollection creation events", () => {
			let createCalls1 = 0;
			const createInfo1: { local: boolean; label: string }[] = [];
			const createCallback1 = (label: string, local: boolean, target: SharedString) => {
				assert.strictEqual(target, sharedString, "Expected event to target sharedString");
				createInfo1[createCalls1++] = { local, label };
			};
			sharedString.on("createIntervalCollection", createCallback1);

			let createCalls2 = 0;
			const createInfo2: { local: boolean; label: string }[] = [];
			const createCallback2 = (label: string, local: boolean, target: SharedString) => {
				assert.strictEqual(target, sharedString2, "Expected event to target sharedString2");
				createInfo2[createCalls2++] = { local, label };
			};
			sharedString2.on("createIntervalCollection", createCallback2);

			sharedString.insertText(0, "hello world");
			containerRuntimeFactory.processAllMessages();

			const collection1: IIntervalCollection<SequenceInterval> =
				sharedString.getIntervalCollection("test1");
			const interval1 = collection1.add({ start: 0, end: 1 });
			const intervalId1 = interval1.getIntervalId();
			assert(intervalId1);
			collection1.change(intervalId1, { start: 1, end: 4 });

			const collection2: IIntervalCollection<SequenceInterval> =
				sharedString2.getIntervalCollection("test2");
			const interval2 = collection2.add({ start: 0, end: 2 });
			const intervalId2 = interval2.getIntervalId();
			assert(intervalId2);
			collection2.removeIntervalById(intervalId2);

			const collection3: IIntervalCollection<SequenceInterval> =
				sharedString2.getIntervalCollection("test3");
			collection3.add({ start: 0, end: 3 });

			containerRuntimeFactory.processAllMessages();

			const verifyCreateEvents = (s: SharedString, createInfo, infoArray) => {
				let i = 0;
				const labels = s.getIntervalCollectionLabels();
				for (const label of labels) {
					assert.equal(label, infoArray[i].label, `Bad label ${i}: ${label}`);
					assert.equal(
						label,
						createInfo[i].label,
						`Bad label ${i}: ${createInfo[i].label}`,
					);
					assert.equal(
						createInfo[i].local,
						infoArray[i].local,
						`Bad local value ${i}: ${createInfo[i].local}`,
					);
					i++;
				}
				assert.equal(
					infoArray.length,
					createInfo.length,
					`Wrong number of create calls: ${i}`,
				);
			};
			verifyCreateEvents(sharedString, createInfo1, [
				{ label: "test1", local: true },
				{ label: "test2", local: false },
				{ label: "test3", local: false },
			]);
			verifyCreateEvents(sharedString2, createInfo2, [
				{ label: "test2", local: true },
				{ label: "test3", local: true },
				{ label: "test1", local: false },
			]);
		});

		it("can be concurrently created", () => {
			sharedString.insertText(0, "hello world");
			const collection1 = sharedString.getIntervalCollection("test");
			const collection2 = sharedString2.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();
			assert.equal(Array.from(collection1).length, 0);
			assert.equal(Array.from(collection2).length, 0);
		});

		it("doesn't slide references on ack if there are pending remote changes", () => {
			sharedString.insertText(0, "ABCDEF");
			const collection1 = sharedString.getIntervalCollection("test");
			const collection2 = sharedString2.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();
			sharedString.removeRange(3, 6);
			const interval = collection2.add({ start: 3, end: 4 });
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection2.change(intervalId, { start: 1, end: 5 });

			assert.equal(
				containerRuntimeFactory.outstandingMessageCount,
				3,
				"Unexpected number of ops",
			);
			containerRuntimeFactory.processOneMessage();
			assertSequenceIntervals(sharedString2, collection2, [
				{ start: 1, end: 3 /* hasn't yet been acked */ },
			]);
			containerRuntimeFactory.processOneMessage();
			assertSequenceIntervals(sharedString2, collection2, [
				{ start: 1, end: 3 /* hasn't yet been acked */ },
			]);
			containerRuntimeFactory.processOneMessage();
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 2 }]);

			assert.equal(sharedString.getText(), "ABC");
			assertSequenceIntervals(sharedString, collection1, [{ start: 1, end: 2 }]);
		});

		describe("have eventually consistent property sets", () => {
			it("when an interval is modified with a pending change", () => {
				sharedString.insertText(0, "ABC");
				const collection1 = sharedString.getIntervalCollection("test");
				const collection2 = sharedString2.getIntervalCollection("test");
				const interval = collection1.add({ start: 0, end: 0 });
				containerRuntimeFactory.processAllMessages();
				const id = interval.getIntervalId();
				assert(id);
				collection1.change(id, { start: 1, end: 1 });
				collection1.change(id, { props: { propName: "losing value" } });
				collection2.change(id, { props: { propName: "winning value" } });
				containerRuntimeFactory.processAllMessages();
				assert.equal(collection1.getIntervalById(id)?.properties.propName, "winning value");
				assert.equal(collection2.getIntervalById(id)?.properties.propName, "winning value");
			});
		});
	});

	describe("reconnect", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let sharedString2: SharedString;

		let collection1: IIntervalCollection<SequenceInterval>;
		let collection2: IIntervalCollection<SequenceInterval>;
		let interval: SequenceInterval;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Connect the first SharedString.
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1: IChannelServices = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString.initializeLocal();
			sharedString.connect(services1);

			// Create and connect a second SharedString.
			const runtime2 = new MockFluidDataStoreRuntime({ clientId: "2" });
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(runtime2);
			sharedString2 = new SharedString(
				runtime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			const services2: IChannelServices = {
				deltaConnection: runtime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString2.initializeLocal();
			sharedString2.connect(services2);

			sharedString.insertText(0, "hello friend");
			collection1 = sharedString.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();

			collection2 = sharedString2.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();

			// Note: at the start of each test, this interval is only visible to client 1.
			interval = collection1.add({ start: 6, end: 8 }); // the "fr" in "friend"
		});

		it("addInterval resubmitted with concurrent insert", async () => {
			containerRuntime1.connected = false;

			sharedString2.insertText(7, "amily its my f");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			assert.equal(sharedString2.getText(), "hello family its my friend");
			assertSequenceIntervals(sharedString2, collection2, [{ start: 6, end: 22 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 6, end: 22 }]);
		});

		// This is useful to ensure rebasing reconnection ops doesn't take into account local string state
		// that has been applied since the interval addition.
		it("addInterval and string operations resubmitted with concurrent insert", async () => {
			containerRuntime1.connected = false;

			sharedString2.insertText(7, "amily its my f");
			sharedString.removeText(0, 5);
			sharedString.insertText(0, "hi");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			assert.equal(sharedString2.getText(), "hi family its my friend");
			assertSequenceIntervals(sharedString2, collection2, [{ start: 3, end: 19 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 3, end: 19 }]);
		});

		describe("correctly tracks pendingChanges for", () => {
			// This is a regression suite for an issue involving faulty update of the pendingChange maps
			// when both an add and a change op are rebased. Pending change tracking should only apply
			// to "change" ops, but was also erroneously updated for "add" ops. Change tracking should also
			// properly handle rebasing ops that only affect one endpoint.

			it("an add followed by a change", () => {
				const intervalId = interval.getIntervalId();
				assert(intervalId);
				collection1.removeIntervalById(intervalId);
				containerRuntimeFactory.processAllMessages();
				containerRuntime1.connected = false;
				const newInterval = collection1.add({ start: 0, end: 1 });
				sharedString.insertText(2, "llo he");
				const newIntervalId = newInterval.getIntervalId();
				assert(newIntervalId);
				collection1.change(newIntervalId, { start: 6, end: 7 });
				// Previously would fail: rebase of the "add" op would cause "Mismatch in pending changes"
				// assert to fire (since the pending change wasn't actually the addition of the interval;
				// it was the change)
				containerRuntime1.connected = true;
				containerRuntimeFactory.processAllMessages();
				const expectedIntervals = [{ start: 6, end: 7 }];
				assertSequenceIntervals(sharedString, collection1, expectedIntervals);
				assertSequenceIntervals(sharedString2, collection2, expectedIntervals);
			});

			it("a change", () => {
				// Like above, but the string-modifying operation is performed remotely. This means the pendingChange
				// recorded prior to rebasing will have a different index from the pendingChange that would be generated
				// upon rebasing (so failing to update would cause mismatch)
				const intervalId = interval.getIntervalId();
				const start = 6;
				const end = 7;
				assert(intervalId);
				collection1.removeIntervalById(intervalId);
				containerRuntimeFactory.processAllMessages();
				containerRuntime1.connected = false;
				const newInterval = collection1.add({ start: 0, end: 1 });
				sharedString2.insertText(2, "llo he");
				const newIntervalId = newInterval.getIntervalId();
				assert(newIntervalId);
				collection1.change(newIntervalId, { start, end });
				containerRuntimeFactory.processAllMessages();
				containerRuntime1.connected = true;
				containerRuntimeFactory.processAllMessages();
				const expectedStart = start + "llo he".length;
				const expectedEnd = end + "llo he".length;
				const expectedIntervals = [{ start: expectedStart ?? 0, end: expectedEnd }];
				assertSequenceIntervals(sharedString, collection1, expectedIntervals);
				assertSequenceIntervals(sharedString2, collection2, expectedIntervals);
			});
		});

		it("can rebase a change operation to positions that are invalid in the current view", () => {
			// This is a regression test for an issue in which attempting to rebase an interval op could hit
			// issues in local position validation. The root cause was that the rebase logic round-tripped its
			// rebase positions through a SequenceInterval (i.e. constructed an interval with the desired rebase
			// positions, then serialized it). The problem is that interval isn't always valid to construct on
			// the state of the local client's merge tree.
			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = false;
			// Since there aren't any other ops, the idea is the rebased version of this op would be the same as
			// the original version. However, at the time the client is rebasing, it only has a single character of
			// text. So it's impossible to generate valid LocalReference_s with positions that evaluate to 8 and 9
			// as the original problematic implementation did.
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection1.change(intervalId, { start: 8, end: 9 });
			sharedString.removeRange(1, sharedString.getLength());
			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: 0, end: 0 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 0 }]);
		});

		it("can rebase changeProperty ops", () => {
			containerRuntime1.connected = false;
			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection1.change(intervalId, { props: { foo: "prop" } });
			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString, collection1, [{ start: 6, end: 8 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 6, end: 8 }]);
			const interval2 = collection2.getIntervalById(intervalId);
			assert.equal(interval2?.properties.foo, "prop");
			assert.equal(interval.properties.foo, "prop");
		});

		it("addInterval resubmitted with concurrent delete", async () => {
			containerRuntime1.connected = false;

			sharedString2.removeText(5, 9);
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			assert.equal(sharedString2.getText(), "helloend");
			assertSequenceIntervals(sharedString2, collection2, [{ start: 5, end: 5 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 5, end: 5 }]);
		});

		it("delete resubmitted with concurrent insert", async () => {
			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = false;

			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection1.removeIntervalById(intervalId);
			sharedString2.insertText(7, "amily its my f");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			// Verify that the changes were correctly received by the second SharedString
			assert.equal(sharedString2.getText(), "hello family its my friend");
			assertSequenceIntervals(sharedString2, collection2, []);
			assertSequenceIntervals(sharedString, collection1, []);
		});

		it("change resubmitted with concurrent insert", async () => {
			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = false;

			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection1.change(intervalId, { start: 5, end: 9 }); // " fri"
			sharedString2.insertText(7, "amily its my f");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			assert.equal(sharedString2.getText(), "hello family its my friend");
			assertSequenceIntervals(sharedString2, collection2, [{ start: 5, end: 23 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 5, end: 23 }]);
		});

		it("change resubmitted with concurrent delete", async () => {
			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = false;

			const intervalId = interval.getIntervalId();
			assert(intervalId);
			collection1.change(intervalId, { start: 5, end: 9 }); // " fri"
			sharedString2.removeText(8, 10);
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			assert.equal(sharedString2.getText(), "hello frnd");
			assertSequenceIntervals(sharedString2, collection2, [{ start: 5, end: 8 }]);
			assertSequenceIntervals(sharedString, collection1, [{ start: 5, end: 8 }]);
		});
	});

	describe("querying intervals with index API's", () => {
		describe("support attaching/detaching an index", () => {
			let collection;
			let mockIntervalIndex;
			let id1;
			let id2;

			beforeEach(() => {
				sharedString.initializeLocal();
				collection = sharedString.getIntervalCollection("test");
				sharedString.insertText(0, "xyzabc");
				id1 = collection.add({ start: 1, end: 1 }).getIntervalId();
				id2 = collection.add({ start: 1, end: 3 }).getIntervalId();

				mockIntervalIndex = new MockIntervalIndex();
				collection.attachIndex(mockIntervalIndex);
			});

			it("can add all intervals in collection to the attached index", () => {
				assert.strictEqual(collection.getIntervalById(id1), mockIntervalIndex.get(0));
				assert.strictEqual(collection.getIntervalById(id2), mockIntervalIndex.get(1));
			});

			it("the intervals in attached index should be synced with those in collection after updating", () => {
				const id3 = collection.add({ start: 2, end: 5 }).getIntervalId();
				assert.strictEqual(collection.getIntervalById(id3), mockIntervalIndex.get(2));
				collection.removeIntervalById(id2);
				assert.strictEqual(collection.getIntervalById(id1), mockIntervalIndex.get(0));
				assert.strictEqual(collection.getIntervalById(id3), mockIntervalIndex.get(1));
			});

			it("detached index should not affect the intervals in collection", () => {
				assert.equal(collection.detachIndex(mockIntervalIndex), true);
				assert.equal(mockIntervalIndex.size(), 0);
				assertIntervalEquals(sharedString, collection.getIntervalById(id1), {
					start: 1,
					end: 1,
				});
				assertIntervalEquals(sharedString, collection.getIntervalById(id2), {
					start: 1,
					end: 3,
				});
			});

			it("can not detach the index does not exist", () => {
				assert.equal(collection.detachIndex(mockIntervalIndex), true);
				assert.equal(collection.detachIndex(mockIntervalIndex), false);
			});
		});
	});

	describe("maintain consistency between the collection label and that in interval properties", () => {
		let collection;

		beforeEach(() => {
			sharedString.initializeLocal();
			collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "xyz");
		});

		it("can not insert the interval which does not belong to this collection", () => {
			assert.throws(
				() => {
					collection.add({
						start: 1,
						end: 1,
						props: {
							[reservedRangeLabelsKey]: ["test2"],
						},
					});
				},
				LoggingError,
				"The collection is unable to add an interval which does not belong to it",
			);
		});

		it("can not modify the interval's label after it has been inserted to the collection", () => {
			const id = collection.add({ start: 1, end: 1 }).getIntervalId();
			assert.throws(
				() => {
					collection.change(id, { props: { [reservedRangeLabelsKey]: ["test2"] } });
				},
				LoggingError,
				"The label property of an interval should not be modified once inserted to the collection",
			);
		});
	});

	describe("interval stickiness", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			dataStoreRuntime1 = new MockFluidDataStoreRuntime({ clientId: "1" });
			dataStoreRuntime1.options = {
				intervalStickinessEnabled: true,
				mergeTreeReferencesCanSlideToEndpoint: true,
			};
			sharedString = new SharedString(
				dataStoreRuntime1,
				"shared-string-1",
				SharedStringFactory.Attributes,
			);

			containerRuntimeFactory = new MockContainerRuntimeFactory();
			dataStoreRuntime1.setAttachState(AttachState.Attached);
			const containerRuntime1 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: containerRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString.initializeLocal();
			sharedString.connect(services1);
		});

		it("has start stickiness", () => {
			// (-Xabc)-
			// (-Xdefabc)-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "Xabc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: "start",
				end: { pos: 3, side: Side.After },
			});
			assert.equal(interval1.stickiness, IntervalStickiness.START);
			assert.equal(interval1.startSide, Side.Before);
			assert.equal(interval1.endSide, Side.After);
			assert.equal(interval1.start.slidingPreference, SlidingPreference.BACKWARD);
			assert.equal(interval1.end.slidingPreference, SlidingPreference.BACKWARD);

			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(1, "def");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "Xdefabc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 6 }]);
		});

		it("has start stickiness during delete inside interval", () => {
			// (-Xabc)-
			// (-Xdefabc)-
			// (-Xfabc)-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "Xabc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({ start: "start", end: { pos: 3, side: Side.After } });
			assert.equal(interval1.stickiness, IntervalStickiness.START);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(1, "def");
			containerRuntimeFactory.processAllMessages();
			sharedString.removeRange(1, 3);
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "Xfabc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 4 }]);
		});

		it("has start stickiness during delete of start of interval", () => {
			// -abc(Xdef]-
			// -abc(Xghidef]-
			// -(aghidef]-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abcXdef");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 3, side: Side.After },
				end: { pos: 6, side: Side.After },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.START);
			assert.equal(interval1.startSide, Side.After);
			assert.equal(interval1.endSide, Side.After);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(4, "ghi");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "abcXghidef", "different text");
			assertSequenceIntervals(sharedString, collection, [{ start: 3, end: 9 }]);

			sharedString.removeRange(1, 4);
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(interval1.start.getSegment()?.constructor.name, "TextSegment");
			assert.strictEqual(interval1.start.getSegment()?.isLeaf(), true);
			assert.strictEqual(interval1.end.getSegment()?.constructor.name, "TextSegment");

			assert.strictEqual(sharedString.getText(), "aghidef", "different text");
			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 6 }]);
		});

		it("has start stickiness when spanning whole string and insertion at index 0", () => {
			// (-abc]-
			// (-Xabc]-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({ start: "start", end: { pos: 2, side: Side.After } });
			assert.equal(interval1.stickiness, IntervalStickiness.START);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(0, "X");
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				interval1.start.getSegment()?.constructor.name,
				"StartOfTreeSegment",
			);
			assert.strictEqual(interval1.end.getSegment()?.constructor.name, "TextSegment");

			assert.strictEqual(sharedString.getText(), "Xabc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }], false);
		});

		it("has full stickiness when spanning whole string and insertion at index 0", () => {
			// (-abc)-
			// (-Xabc)-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: "start",
				end: { pos: 2, side: Side.Before },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.FULL);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(0, "X");
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				interval1.start.getSegment()?.constructor.name,
				"StartOfTreeSegment",
			);
			assert.strictEqual(interval1.end.getSegment()?.constructor.name, "TextSegment");

			assert.strictEqual(sharedString.getText(), "Xabc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }], false);
		});

		it("has end stickiness when spanning whole string and insertion at index 0", () => {
			// -[abc-)
			// -X[abc-)
			// -X[abcX-)
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({ start: 0, end: "end" });
			assert.equal(interval1.stickiness, IntervalStickiness.END);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(0, "X");
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(interval1.start.getSegment()?.constructor.name, "TextSegment");
			assert.strictEqual(interval1.end.getSegment()?.constructor.name, "EndOfTreeSegment");

			assert.strictEqual(sharedString.getText(), "Xabc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 4 }], false);

			sharedString.insertText(4, "X");
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(interval1.start.getSegment()?.constructor.name, "TextSegment");
			assert.strictEqual(interval1.end.getSegment()?.constructor.name, "EndOfTreeSegment");

			assert.strictEqual(sharedString.getText(), "XabcX", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 5 }], false);
		});

		it("full stickiness doesn't slide off string when entire string is deleted", () => {
			// -(abc)def-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abcdef");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 0, side: Side.After },
				end: { pos: 2, side: Side.Before },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.FULL);
			assert.equal(interval1.startSide, Side.After);
			assert.equal(interval1.endSide, Side.Before);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.removeRange(0, 6);
			containerRuntimeFactory.processAllMessages();
			sharedString.insertText(0, "XXX");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "XXX", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }], false);
		});

		it("none stickiness slides off string when entire string is deleted", () => {
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 1, side: Side.Before },
				end: { pos: 2, side: Side.After },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.NONE);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.removeRange(0, 3);
			containerRuntimeFactory.processAllMessages();
			sharedString.insertText(0, "XXX");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "XXX", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: -1, end: -1 }], false);
		});

		it("none stickiness slides off string when entire string is deleted incrementally", () => {
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 1, side: Side.Before },
				end: { pos: 2, side: Side.After },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.NONE);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.removeRange(0, 1);
			sharedString.removeRange(0, 1);
			sharedString.removeRange(0, 1);
			containerRuntimeFactory.processAllMessages();
			sharedString.insertText(0, "XXX");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "XXX", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: -1, end: -1 }], false);
		});

		it("full stickiness doesn't slide off string when entire string is deleted incrementally", () => {
			// -(abc)-
			// (--)
			// (-XXX-)
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 0, side: Side.After },
				end: { pos: 2, side: Side.Before },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.FULL);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.removeRange(0, 1);
			sharedString.removeRange(0, 1);
			sharedString.removeRange(0, 1);
			containerRuntimeFactory.processAllMessages();
			sharedString.insertText(0, "XXX");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "XXX", "different text");

			assert.strictEqual(interval1.start.slidingPreference, SlidingPreference.BACKWARD);
			assert.strictEqual(interval1.end.slidingPreference, SlidingPreference.FORWARD);
			assert.strictEqual(
				interval1.start.getSegment()?.constructor.name,
				"StartOfTreeSegment",
			);
			assert.strictEqual(interval1.end.getSegment()?.constructor.name, "EndOfTreeSegment");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }], false);
		});

		it("doesn't have start stickiness when spanning whole string and insertion at index 0", () => {
			// -[abc-)
			// -X[abc-)
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 0, side: Side.Before },
				end: "end",
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.END);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(0, "X");
			containerRuntimeFactory.processAllMessages();
			assert.notStrictEqual(
				interval1.start.getSegment()?.constructor.name,
				"StartOfTreeSegment",
			);

			assert.strictEqual(sharedString.getText(), "Xabc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 4 }], false);
		});

		it("slides to endpoint after deleting all text to left of start-sticky+exclusive reference", () => {
			// -a(bcde]f-
			// (-Xde]f
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abcdef");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 1, side: Side.After },
				end: { pos: 5, side: Side.After },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.START);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.removeRange(0, 3);
			sharedString.insertText(0, "X");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "Xdef", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }], false);
		});

		it("has end stickiness", () => {
			// -[abc)-
			// -[abdefc)-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 0, side: Side.Before },
				end: { pos: 2, side: Side.Before },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.END);
			assert.equal(interval1.start.slidingPreference, SlidingPreference.FORWARD);
			assert.equal(interval1.end.slidingPreference, SlidingPreference.FORWARD);

			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(2, "def");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "abdefc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 5 }]);
		});

		it("has end stickiness during delete of end of interval", () => {
			// -[abcX)-
			// -[abcf)-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abcXdef");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 0, side: Side.Before },
				end: { pos: 4, side: Side.Before },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.END);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);

			containerRuntimeFactory.processAllMessages();

			sharedString.removeRange(3, 6);
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "abcf", "different text");
			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }]);
		});

		it("has end stickiness by default", () => {
			// [abcX)
			// [abcf)
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abcXdef");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({ start: 0, end: 3 });
			assert.equal(interval1.stickiness, IntervalStickiness.END);
			assert.equal(interval1.start.slidingPreference, SlidingPreference.FORWARD);
			assert.equal(interval1.end.slidingPreference, SlidingPreference.FORWARD);

			const intervalId = interval1.getIntervalId();
			assert(intervalId);

			containerRuntimeFactory.processAllMessages();

			sharedString.removeRange(3, 6);
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "abcf", "different text");
			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 3 }]);
		});

		it("has none stickiness during insert", () => {
			// -[ab]c-
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: { pos: 0, side: Side.Before },
				end: { pos: 1, side: Side.After },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.NONE);
			assert.equal(interval1.start.slidingPreference, SlidingPreference.FORWARD);
			assert.equal(interval1.end.slidingPreference, SlidingPreference.BACKWARD);
			const intervalId = interval1.getIntervalId();
			assert(intervalId);
			sharedString.insertText(2, "def");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedString.getText(), "abdefc", "different text");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 1 }]);
		});

		it("has correct sliding preference for full stickiness", () => {
			const collection = sharedString.getIntervalCollection("test");
			sharedString.insertText(0, "abc");
			containerRuntimeFactory.processAllMessages();
			const interval1 = collection.add({
				start: "start",
				end: { pos: 2, side: Side.Before },
				props: undefined,
			});
			assert.equal(interval1.stickiness, IntervalStickiness.FULL);
			assert.equal(interval1.start.slidingPreference, SlidingPreference.BACKWARD);
			assert.equal(interval1.end.slidingPreference, SlidingPreference.FORWARD);
		});

		it("slides backward reference to correct position when remove is unacked", () => {
			sharedString.insertText(0, "ABC");

			// (AB]C

			containerRuntimeFactory.processAllMessages();

			const start = { pos: 0, side: Side.After };
			const end = { pos: 1, side: Side.After };

			const collection = sharedString.getIntervalCollection("test");
			collection.add({ end, start });

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 1 }]);

			sharedString.removeText(1, 2);

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);
		});

		it("slides backward reference to correct position when remove multiple segments is unacked", () => {
			sharedString.insertText(0, "ABC");

			// (AB]C
			// (AYYYXXXB]C

			containerRuntimeFactory.processAllMessages();

			const start = { pos: 0, side: Side.After };
			const end = { pos: 1, side: Side.After };

			const collection = sharedString.getIntervalCollection("test");
			collection.add({ end, start });

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 1 }]);

			sharedString.insertText(1, "XXX");
			sharedString.insertText(1, "YYY");
			sharedString.removeText(1, 8);

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);
		});

		it("slides backward reference to correct position when start of string remove is unacked", () => {
			sharedString.insertText(0, "ABC");

			// (AB]C

			containerRuntimeFactory.processAllMessages();

			const start = { pos: 0, side: Side.After };
			const end = { pos: 1, side: Side.Before };

			const collection = sharedString.getIntervalCollection("test");
			const interval = collection.add({ end, start });

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 1 }]);

			sharedString.removeText(0, 2);

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);

			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(interval.start.getSegment()?.constructor.name, "StartOfTreeSegment");

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);
		});

		it.skip("slides forward reference to correct position when remove of end of string is unacked", () => {
			dataStoreRuntime1.options.mergeTreeReferencesCanSlideToEndpoint = false;
			sharedString.insertText(0, "ABC");

			// (ABC]

			containerRuntimeFactory.processAllMessages();

			const start = 0;
			const end = 2;

			const collection = sharedString.getIntervalCollection("test");
			collection.add({ end, start });

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 2 }]);

			sharedString.removeText(1, 3);

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);

			containerRuntimeFactory.processAllMessages();

			assertSequenceIntervals(sharedString, collection, [{ start: 0, end: 0 }]);
		});
	});
});
