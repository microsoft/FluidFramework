/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Side } from "@fluidframework/merge-tree/internal";
import { useStrictPartialLengthChecks } from "@fluidframework/merge-tree/internal/test";
import { MockContainerRuntimeFactoryForReconnection } from "@fluidframework/test-runtime-utils/internal";

import { IntervalStickiness } from "../intervals/index.js";

import { Client, assertConsistent, assertSequenceIntervals } from "./intervalTestUtils.js";
import { constructClient, constructClients, loadClient } from "./multiClientTestUtils.js";

describe("interval rebasing", () => {
	useStrictPartialLengthChecks();

	function setup3Clients(): {
		containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		clients: Client[];
	} {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		return {
			containerRuntimeFactory,
			clients: constructClients(containerRuntimeFactory),
		};
	}

	it("does not crash for an interval that lies on segment that has been removed locally", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		clients[1].containerRuntime.connected = false;
		clients[1].sharedString.insertText(0, "01234");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].containerRuntime.connected = true;
		clients[0].sharedString.insertText(0, "012345678901234");
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({ start: 12, end: 15 });
		clients[2].sharedString.removeRange(5, 7);
		clients[0].sharedString.removeRange(3, 5);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].sharedString.insertText(13, "0123");
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("does not crash when entire string on which interval lies is concurrently removed", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "a");
		clients[1].sharedString.insertText(0, "a");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = false;
		clients[1].sharedString.removeRange(0, 2);
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({ start: 0, end: 1 });
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
	});

	it("does not crash when interval is removed before reconnect when string is concurrently removed", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		clients[1].sharedString.insertText(0, "B");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = false;
		clients[1].sharedString.removeRange(0, 2);
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({ start: 0, end: 1 });
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		collection_0.removeIntervalById("id");
		clients[0].containerRuntime.connected = true;
	});

	it("does not crash when interval slides off end of string", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "012Z45");
		clients[2].sharedString.insertText(0, "X");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].sharedString.insertText(0, "01234567");
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].sharedString.insertText(0, "ABCDEFGHIJKLMN");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({
			start: 20,
			end: 20,
		});
		clients[2].sharedString.removeRange(13, 15);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("handles basic interval sliding for obliterate", async () => {
		// A-(BC)

		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "ABC");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({
			start: 0,
			end: 2,
		});
		clients[0].sharedString.obliterateRange(1, 3);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("reference is -1 for obliterated segment", async () => {
		// (L-PC-F)

		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[1].sharedString.insertText(0, "F");
		clients[0].sharedString.insertText(0, "PC");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({
			start: 0,
			end: 1,
		});
		clients[1].sharedString.insertText(0, "L");
		clients[1].sharedString.obliterateRange(0, 2);

		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("slides to correct final destination", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[2].sharedString.insertText(0, "B");
		clients[2].sharedString.removeRange(0, 2);
		clients[0].sharedString.insertText(0, "C");

		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({
			start: 0,
			end: 1,
		});

		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("does not slide to invalid position when 0-length interval", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		// A 0-length interval is required here to reproduce this error. If in
		// the future we wish to stop supporting 0-length intervals, this test
		// can be removed
		collection_0.add({
			start: 0,
			end: 0,
		});
		clients[1].sharedString.insertText(0, "BCD");
		clients[1].sharedString.removeRange(0, 1);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[2].sharedString.removeRange(1, 3);
		clients[1].sharedString.insertText(1, "E");
		const collection_1 = clients[1].sharedString.getIntervalCollection("comments");
		collection_1.add({
			start: 0,
			end: 2,
		});

		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);

		assert.equal(clients[0].sharedString.getText(), "CE");
	});

	it("is consistent for full stickiness", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		clients[0].sharedString.insertText(0, "BC");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		const collection_1 = clients[1].sharedString.getIntervalCollection("comments");
		const interval1 = collection_1.add({
			start: "start",
			end: "end",
		});
		assert.equal(interval1.stickiness, IntervalStickiness.FULL);
		clients[0].sharedString.removeRange(0, 1);
		clients[1].sharedString.removeRange(0, 3);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("keeps obliterate segment group the same across multiple reconnects", async () => {
		// A-C
		// (A-B-C)
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "C");
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].sharedString.insertText(1, "B");
		clients[1].sharedString.obliterateRange(0, 2);
		clients[1].containerRuntime.connected = false;
		clients[1].containerRuntime.connected = true;
		clients[1].containerRuntime.connected = false;
		clients[1].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("doesn't crash for empty pending segment group", async () => {
		// A
		// ((A))-[D]
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.insertText(1, "D");
		clients[0].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.removeRange(0, 1);
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = true;

		assert.equal(clients[0].sharedString.getText(), "");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("zamboni avoids modifying segments with pending interval changes", async () => {
		// C-AB
		// D-C-AB
		// E-HIJ-FG-D-C-AB
		//   ^----------^
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[2].sharedString.insertText(0, "AB");
		clients[0].sharedString.insertText(0, "C");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].containerRuntime.connected = false;
		clients[2].sharedString.insertText(0, "D");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[2].sharedString.insertText(0, "E");
		clients[1].sharedString.insertText(0, "FG");
		clients[1].sharedString.insertText(0, "HIJ");
		clients[0].containerRuntime.connected = false;
		const collection_0 = clients[1].sharedString.getIntervalCollection("comments");
		collection_0.add({ start: 0, end: 7 });
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].containerRuntime.connected = true;
	});

	it("zamboni avoids modifying segments with pending interval changes through multiple reconnects", async () => {
		// Note: the specifics of the attach flow shouldn't be necessary here to reproduce this issue.
		// All that's necessary is that the "R" segment is zamboni'd.
		// However, due to zamboni's fragility, some care needs to be taken for that to happen.
		// See AB#7048 for more details.
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const A = constructClient(containerRuntimeFactory, "A");
		A.sharedString.insertText(0, "Rr");
		A.sharedString.connect(A.services);
		const B = await loadClient(containerRuntimeFactory, A, "B");
		B.sharedString.removeRange(0, 1);
		const collection = A.sharedString.getIntervalCollection("comments");
		collection.add({
			start: { pos: 1, side: Side.After },
			end: { pos: 0, side: Side.Before },
		});
		A.containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		B.sharedString.insertText(0, "8");
		A.containerRuntime.connected = true;
		A.containerRuntime.connected = false;
		B.sharedString.insertText(0, "J");
		containerRuntimeFactory.processAllMessages();
		A.containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent([A, B]);
	});

	// Reproduction of seed 70. Appears to be some problem with normalization of segments interacting
	// with sliding logic on reconnect. The ordering of the 22222 and 11 segments is not consistent
	// across clients even when in the collab window, and the local reference gets put on this segment.
	// So clients[0] disagrees with the others about where the reference slides.
	it.skip("AB#6552", async () => {
		// Note: all 3 clients submit edits. When debugging this test, it might be helpful to
		// add a 4th client that doesn't submit any edits. E.g.:
		// clients = constructClients(containerRuntimeFactory, 4);
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "000");
		containerRuntimeFactory.processAllMessages();
		clients[0].containerRuntime.connected = false;
		clients[1].containerRuntime.connected = false;
		clients[1].sharedString.insertText(0, "11");
		clients[0].sharedString.insertText(1, "22222");
		clients[0].sharedString
			.getIntervalCollection("test collection")
			.add({ start: { pos: 1, side: Side.After }, end: { pos: 1, side: Side.After } });
		clients[0].sharedString.removeRange(0, 6);
		clients[2].sharedString.removeRange(0, 2);
		containerRuntimeFactory.processAllMessages();
		clients[0].sharedString.insertText(1, "3");
		clients[1].containerRuntime.connected = true;
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("doesn't create empty segment group when obliterated segment was obliterated by other client during reconnect", async () => {
		// A
		// ((A))-[D]
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.insertText(1, "D");
		clients[0].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.removeRange(0, 1);
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
		clients[0].containerRuntime.connected = false;
		clients[0].containerRuntime.connected = true;

		assert.equal(clients[0].sharedString.getText(), "");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("reconnected obliterate still removes content it intended to remove", async () => {
		// AB
		// A-C-B
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "AB");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].sharedString.insertText(1, "C");
		clients[1].containerRuntime.connected = false;
		clients[1].sharedString.obliterateRange(0, 2);
		clients[1].containerRuntime.connected = true;
		clients[1].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("Obliterate reconnect regression test", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "AB");
		clients[1].sharedString.insertText(0, "CD");
		clients[1].sharedString.insertText(1, "E");
		clients[0].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.insertText(0, "FGHIJK");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].sharedString.insertText(4, "L");
		clients[2].sharedString.obliterateRange(3, 5);
		clients[0].containerRuntime.connected = false;
		clients[0].sharedString.obliterateRange(1, 2);
		clients[0].sharedString.insertText(7, "M");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("slides two refs on same segment to different segments", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "AB");
		clients[0].sharedString.insertText(0, "C");
		const collection_1 = clients[0].sharedString.getIntervalCollection("comments");
		const interval1 = collection_1.add({
			start: { pos: 0, side: Side.After },
			end: "end",
		});
		assert.equal(interval1.stickiness, IntervalStickiness.FULL);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[2].sharedString.removeRange(1, 2);
		const collection_2 = clients[1].sharedString.getIntervalCollection("comments");
		const interval2 = collection_2.add({
			start: "start",
			end: { pos: 2, side: Side.Before },
		});
		assert.equal(interval2.stickiness, IntervalStickiness.FULL);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("maintains sliding preference on references after ack", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[1].sharedString.insertText(0, "ABC");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].sharedString.removeRange(0, 1);
		clients[0].sharedString.insertText(0, "D");
		const collection_1 = clients[1].sharedString.getIntervalCollection("comments");
		collection_1.add({
			start: { pos: 0, side: Side.After },
			end: 1,
		});
		clients[2].sharedString.removeRange(1, 2);
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("maintains sliding preference on references after reconnect with special endpoint segment", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "D");
		clients[0].containerRuntime.connected = false;
		const collection_1 = clients[0].sharedString.getIntervalCollection("comments");
		const interval = collection_1.add({
			start: "start",
			end: 0,
		});
		assert.equal(interval.stickiness, IntervalStickiness.FULL);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("maintains sliding preference on references after reconnect", async () => {
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "D");
		clients[0].containerRuntime.connected = false;
		const collection_1 = clients[0].sharedString.getIntervalCollection("comments");
		const interval = collection_1.add({
			start: { pos: 0, side: Side.After },
			end: 0,
		});
		assert.equal(interval.stickiness, IntervalStickiness.FULL);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
	});

	it("Can resubmit insert op at the end of the string", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const A = constructClient(containerRuntimeFactory, "A");

		A.sharedString.insertText(0, "ABCDEF");
		A.sharedString.insertText(0, "GHIJ");
		A.sharedString.insertText(0, "KLMNO");
		A.sharedString.insertText(0, "PQRST");

		// attach
		A.sharedString.connect(A.services);
		const B = await loadClient(containerRuntimeFactory, A, "B");

		A.sharedString.insertText(0, "UVWXYZ");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent([A, B]);
		B.sharedString.insertText(26, "1");
		A.sharedString.removeRange(0, 1);
		B.containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent([A, B]);
		B.containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent([A, B]);
	});

	it("slides to correct segment when inserting segment while disconnected after changing interval", async () => {
		// B-A
		//   ^
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		const interval = collection_0.add({ start: 0, end: 0 });
		collection_0.change(interval.getIntervalId(), { start: 0, end: 0 });
		clients[0].containerRuntime.connected = false;
		clients[0].sharedString.insertText(0, "B");
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);

		assert.equal(clients[0].sharedString.getText(), "BA");

		assertSequenceIntervals(
			clients[0].sharedString,
			clients[0].sharedString.getIntervalCollection("comments"),
			[{ start: 1, end: 1 }],
		);
	});

	it("changing interval to concurrently deleted segment detaches interval", async () => {
		// B-A
		// ^
		// (B)-A
		//     ^
		// (B)-(A)-C
		//         ^
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "A");
		clients[2].sharedString.insertText(0, "B");
		const collection_0 = clients[2].sharedString.getIntervalCollection("comments");
		const interval = collection_0.add({ start: 0, end: 0 });
		const intervalId = interval.getIntervalId();
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].sharedString.removeRange(0, 1);
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[1].sharedString.removeRange(0, 1);
		const collection_1 = clients[0].sharedString.getIntervalCollection("comments");
		collection_1.change(intervalId, { start: 0, end: 0 });
		clients[2].sharedString.insertText(0, "C");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);

		assert.equal(clients[0].sharedString.getText(), "C");

		assertSequenceIntervals(
			clients[0].sharedString,
			clients[0].sharedString.getIntervalCollection("comments"),
			[{ start: 0, end: 0 }],
		);
	});

	it("changing interval endpoint while disconnected to segment also inserted while disconnected", async () => {
		// AC
		// A-B-C
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].sharedString.insertText(0, "AC");
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		const interval = collection_0.add({ start: 0, end: 0 });
		clients[0].containerRuntime.connected = false;
		clients[0].sharedString.insertText(1, "B");
		collection_0.change(interval.getIntervalId(), { start: 1, end: 1 });
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);

		assert.equal(clients[0].sharedString.getText(), "ABC");

		assertSequenceIntervals(
			clients[0].sharedString,
			clients[0].sharedString.getIntervalCollection("comments"),
			[{ start: 1, end: 1 }],
		);
	});

	it("delete and insert text into range containing interval while disconnected", async () => {
		// 012
		// (0)-x-12
		const { containerRuntimeFactory, clients } = setup3Clients();
		clients[0].containerRuntime.connected = false;
		const intervals = clients[0].sharedString.getIntervalCollection("comments");
		clients[0].sharedString.insertText(0, "012");
		intervals.add({ start: 0, end: 2 });
		assertSequenceIntervals(clients[0].sharedString, intervals, [{ start: 0, end: 2 }]);

		clients[0].sharedString.insertText(1, "x");
		clients[0].sharedString.removeRange(0, 1);
		clients[0].containerRuntime.connected = true;

		containerRuntimeFactory.processAllMessages();
		await assertConsistent(clients);

		assert.equal(clients[0].sharedString.getText(), "x12");

		assertSequenceIntervals(clients[0].sharedString, intervals, [{ start: 0, end: 2 }]);
	});
});
