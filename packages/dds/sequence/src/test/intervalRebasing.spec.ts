/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedStringFactory } from "../sequenceFactory";
import { SharedString } from "../sharedString";
import { IntervalStickiness, IntervalType } from "../intervals";
import { Side } from "../intervalCollection";
import { assertConsistent, Client } from "./intervalTestUtils";

function constructClients(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	numClients = 3,
): [Client, Client, Client] {
	return Array.from({ length: numClients }, (_, index) => {
		const dataStoreRuntime = new MockFluidDataStoreRuntime();
		dataStoreRuntime.options = {
			intervalStickinessEnabled: true,
			mergeTreeEnableObliterate: true,
		};
		const sharedString = new SharedString(
			dataStoreRuntime,
			String.fromCharCode(index + 65),
			SharedStringFactory.Attributes,
		);
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const services: IChannelServices = {
			deltaConnection: dataStoreRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		sharedString.initializeLocal();
		sharedString.connect(services);
		return { containerRuntime, sharedString };
	}) as [Client, Client, Client];
}

describe("interval rebasing", () => {
	let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
	let clients: [Client, Client, Client];

	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		clients = constructClients(containerRuntimeFactory);
	});

	it("does not crash for an interval that lies on segment that has been removed locally", () => {
		clients[0].sharedString.insertText(0, "A");
		clients[1].containerRuntime.connected = false;
		clients[1].sharedString.insertText(0, "01234");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[1].containerRuntime.connected = true;
		clients[0].sharedString.insertText(0, "012345678901234");
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({ start: 12, end: 15, props: { intervalId: "id" } });
		clients[2].sharedString.removeRange(5, 7);
		clients[0].sharedString.removeRange(3, 5);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].sharedString.insertText(13, "0123");
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("does not crash when entire string on which interval lies is concurrently removed", () => {
		clients[0].sharedString.insertText(0, "a");
		clients[1].sharedString.insertText(0, "a");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].containerRuntime.connected = false;
		clients[1].sharedString.removeRange(0, 2);
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({ start: 0, end: 1, props: { intervalId: "id" } });
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
	});

	it("does not crash when interval is removed before reconnect when string is concurrently removed", () => {
		clients[0].sharedString.insertText(0, "a");
		clients[1].sharedString.insertText(0, "a");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].containerRuntime.connected = false;
		clients[1].sharedString.removeRange(0, 2);
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({ start: 0, end: 1, props: { intervalId: "id" } });
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		collection_0.removeIntervalById("id");
		clients[0].containerRuntime.connected = true;
	});

	it("does not crash when interval slides off end of string", () => {
		clients[0].sharedString.insertText(0, "012Z45");
		clients[2].sharedString.insertText(0, "X");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[1].sharedString.insertText(0, "01234567");
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].sharedString.insertText(0, "ABCDEFGHIJKLMN");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({
			start: 20,
			end: 20,
			props: {
				intervalId: "414e09e9-54bf-43ea-9809-9fc5724c43fe",
			},
		});
		clients[2].sharedString.removeRange(13, 15);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("handles basic interval sliding for obliterate", () => {
		// A-(BC)

		clients[0].sharedString.insertText(0, "ABC");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add(0, 2, IntervalType.SlideOnRemove, {
			intervalId: "a",
		});
		clients[0].sharedString.obliterateRange(1, 3);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("reference is -1 for obliterated segment", () => {
		// (L-PC-F)

		clients[1].sharedString.insertText(0, "F");
		clients[0].sharedString.insertText(0, "PC");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add(0, 1, IntervalType.SlideOnRemove, {
			intervalId: "a",
		});
		clients[1].sharedString.insertText(0, "L");
		clients[1].sharedString.obliterateRange(0, 2);

		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("slides to correct final destination", () => {
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[2].sharedString.insertText(0, "B");
		clients[2].sharedString.removeRange(0, 2);
		clients[0].sharedString.insertText(0, "C");

		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		collection_0.add({
			start: 0,
			end: 1,
			props: {
				intervalId: "414e09e9-54bf-43ea-9809-9fc5724c43fe",
			},
		});

		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("does not slide to invalid position when 0-length interval", () => {
		clients[0].sharedString.insertText(0, "A");
		const collection_0 = clients[0].sharedString.getIntervalCollection("comments");
		// A 0-length interval is required here to reproduce this error. If in
		// the future we wish to stop supporting 0-length intervals, this test
		// can be removed
		collection_0.add({
			start: 0,
			end: 0,
			props: {
				intervalId: "1",
			},
		});
		clients[1].sharedString.insertText(0, "BCD");
		clients[1].sharedString.removeRange(0, 1);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[2].sharedString.removeRange(1, 3);
		clients[1].sharedString.insertText(1, "E");
		const collection_1 = clients[1].sharedString.getIntervalCollection("comments");
		collection_1.add({
			start: 0,
			end: 2,
			props: {
				intervalId: "2",
			},
		});

		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("is consistent for full stickiness", () => {
		clients[0].sharedString.insertText(0, "A");
		clients[0].sharedString.insertText(0, "BC");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		const collection_1 = clients[1].sharedString.getIntervalCollection("comments");
		const interval1 = collection_1.add("start", "end", IntervalType.SlideOnRemove, {
			intervalId: "2",
		});
		assert.equal(interval1.stickiness, IntervalStickiness.FULL);
		clients[0].sharedString.removeRange(0, 1);
		clients[1].sharedString.removeRange(0, 3);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("keeps obliterate segment group the same across multiple reconnects", () => {
		// A-C
		// (A-B-C)
		clients[0].sharedString.insertText(0, "C");
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].sharedString.insertText(1, "B");
		clients[1].sharedString.obliterateRange(0, 2);
		clients[1].containerRuntime.connected = false;
		clients[1].containerRuntime.connected = true;
		clients[1].containerRuntime.connected = false;
		clients[1].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("doesn't crash for empty pending segment group", () => {
		// A
		// ((A))-[D]
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[1].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.insertText(1, "D");
		clients[0].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.removeRange(0, 1);
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].containerRuntime.connected = true;

		assert.equal(clients[0].sharedString.getText(), "");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("doesn't create empty segment group when obliterated segment was obliterated by other client during reconnect", () => {
		// A
		// ((A))-[D]
		clients[0].sharedString.insertText(0, "A");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[1].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.insertText(1, "D");
		clients[0].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.removeRange(0, 1);
		clients[0].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
		clients[0].containerRuntime.connected = false;
		clients[0].containerRuntime.connected = true;

		assert.equal(clients[0].sharedString.getText(), "");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	// todo: a failing obliterate reconnect test. when rebasing the op,
	// the character "C" has been concurrently obliterated, so the reconnect
	// position of "B" is computed to be 0, rather than 1
	//
	// at the time of writing, i'm not sure of a good solution. either we could
	// change calculation of reconnection position in some way or we could not
	// concurrently obliterate "C" in this context.
	//
	// in both cases, it's not clear to me how we detect when we're reconnecting
	//
	// ADO#3714
	it.skip("...", () => {
		// AB
		// A-C-B
		clients[0].sharedString.insertText(0, "AB");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].sharedString.insertText(1, "C");
		clients[1].containerRuntime.connected = false;
		clients[1].sharedString.obliterateRange(0, 2);
		clients[1].containerRuntime.connected = true;
		clients[1].containerRuntime.connected = false;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[1].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	// todo: ADO#3714 Failing obliterate reconnect test
	it.skip("...", () => {
		clients[0].sharedString.insertText(0, "AB");
		clients[1].sharedString.insertText(0, "CD");
		clients[1].sharedString.insertText(1, "E");
		clients[0].sharedString.obliterateRange(0, 1);
		clients[0].sharedString.insertText(0, "FGHIJK");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].sharedString.insertText(4, "L");
		clients[2].sharedString.obliterateRange(3, 5);
		clients[0].containerRuntime.connected = false;
		clients[0].sharedString.obliterateRange(1, 2);
		clients[0].sharedString.insertText(7, "M");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("slides two refs on same segment to different segments", () => {
		clients[0].sharedString.insertText(0, "AB");
		clients[0].sharedString.insertText(0, "C");
		const collection_1 = clients[0].sharedString.getIntervalCollection("comments");
		const interval1 = collection_1.add(
			{ pos: 0, side: Side.After },
			"end",
			IntervalType.SlideOnRemove,
			{
				intervalId: "1",
			},
		);
		assert.equal(interval1.stickiness, IntervalStickiness.FULL);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[2].sharedString.removeRange(1, 2);
		const collection_2 = clients[1].sharedString.getIntervalCollection("comments");
		const interval2 = collection_2.add(
			"start",
			{ pos: 2, side: Side.Before },
			IntervalType.SlideOnRemove,
			{
				intervalId: "2",
			},
		);
		assert.equal(interval2.stickiness, IntervalStickiness.FULL);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("maintains sliding preference on references after ack", () => {
		clients[1].sharedString.insertText(0, "ABC");
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
		clients[0].sharedString.removeRange(0, 1);
		clients[0].sharedString.insertText(0, "D");
		const collection_1 = clients[1].sharedString.getIntervalCollection("comments");
		collection_1.add({ pos: 0, side: Side.After }, 1, IntervalType.SlideOnRemove, {
			intervalId: "1",
		});
		clients[2].sharedString.removeRange(1, 2);
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("maintains sliding preference on references after reconnect with special endpoint segment", () => {
		clients[0].sharedString.insertText(0, "D");
		clients[0].containerRuntime.connected = false;
		const collection_1 = clients[0].sharedString.getIntervalCollection("comments");
		const interval = collection_1.add("start", 0, IntervalType.SlideOnRemove, {
			intervalId: "1",
		});
		assert.equal(interval.stickiness, IntervalStickiness.FULL);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});

	it("maintains sliding preference on references after reconnect", () => {
		clients[0].sharedString.insertText(0, "D");
		clients[0].containerRuntime.connected = false;
		const collection_1 = clients[0].sharedString.getIntervalCollection("comments");
		const interval = collection_1.add(
			{ pos: 0, side: Side.After },
			0,
			IntervalType.SlideOnRemove,
			{
				intervalId: "1",
			},
		);
		assert.equal(interval.stickiness, IntervalStickiness.FULL);
		clients[0].containerRuntime.connected = true;
		containerRuntimeFactory.processAllMessages();
		assertConsistent(clients);
	});
});
