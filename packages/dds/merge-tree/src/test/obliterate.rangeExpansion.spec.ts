/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ReconnectTestHelper } from "./reconnectHelper.js";
import { TestClient } from "./testClient.js";

describe("obliterate", () => {
	let client: TestClient;
	let events: number[];

	beforeEach(() => {
		client = new TestClient({
			mergeTreeEnableObliterate: true,
		});
		events = [];
		client.startOrUpdateCollaboration("local");
		for (const char of "hello world") {
			client.applyMsg(
				client.makeOpMessage(
					client.insertTextLocal(client.getLength(), char),
					client.getCurrentSeq() + 1,
				),
			);
		}
		assert.equal(client.getText(), "hello world");
	});

	it("test from word", () => {
		const helper = new ReconnectTestHelper();

		helper.insertText("A", 0, "|ABC>");
		helper.processAllOps();
		helper.obliterateRange("A", 1, 4);
		// not concurrent to A's obliterate - ops on the same client are never concurrent to one another
		// because they are all sequenced locally
		helper.insertText("A", 1, "XYZ");
		helper.obliterateRange("B", 1, 4);
		helper.insertText("B", 1, "XYZ");
		helper.processAllOps();

		assert.equal(helper.clients.A.getText(), "|XYZ>");
		assert.equal(helper.clients.C.getText(), "|XYZ>");

		helper.logger.validate();
	});

	it("outside startpoint of obliterated range", () => {
		const helper = new ReconnectTestHelper();

		helper.insertText("A", 0, "hello world");
		helper.processAllOps();
		helper.obliterateRange("A", 2, 4);
		// do not obliterate the XYZ - outside the obliterated range
		helper.insertText("B", 2, "XYZ");
		helper.processAllOps();

		assert.equal(helper.clients.A.getText(), "hello world");
		assert.equal(helper.clients.C.getText(), "hello world");

		helper.logger.validate();
	});

	it("outside endpoint of obliterated range", () => {
		const helper = new ReconnectTestHelper();

		helper.insertText("A", 0, "hello world");
		helper.processAllOps();
		helper.obliterateRange("A", 2, 4);
		// do not obliterate the XYZ - outside the obliterated range
		helper.insertText("B", 4, "XYZ");
		helper.processAllOps();

		assert.equal(helper.clients.A.getText(), "hello world");
		assert.equal(helper.clients.C.getText(), "hello world");

		helper.logger.validate();
	});

	it("inside endpoint of obliterated range", () => {
		const helper = new ReconnectTestHelper();

		helper.insertText("A", 0, "hello world");
		helper.processAllOps();
		helper.obliterateRange("A", 2, 4);
		// obliterate the XYZ - within the obliterated range
		helper.insertText("B", 3, "XYZ");
		helper.processAllOps();

		assert.equal(helper.clients.A.getText(), "hello world");
		assert.equal(helper.clients.C.getText(), "hello world");

		helper.logger.validate();
	});

	describe("overlapping edits", () => {
		// not sure if the first two are interesting in terms of range expansion
		it("overlapping obliterate and obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				events.push(deltaArgs.operation);
			});

			const text = "abcdef";

			helper.insertText("A", 0, text);
			helper.processAllOps();
			helper.obliterateRange("A", 0, text.length);
			helper.obliterateRange("B", 0, text.length);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(events.length, 2);

			helper.logger.validate();
		});

		it("adjacent obliterates", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", 2, 4);
			helper.obliterateRange("B", 4, 6);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "heworld");
			assert.equal(helper.clients.C.getText(), "heworld");
		});

		it("remove within obliterated range", () => {
			const helper = new ReconnectTestHelper();

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				events.push(deltaArgs.operation);
			});

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", 2, 5);
			helper.removeRange("B", 3, 4);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he world");
			assert.equal(helper.clients.C.getText(), "he world");
			// will only see the insert and obliterate events
			assert.equal(events.length, 2, `events: ${events.join(", ")}`);

			helper.logger.validate();
		});

		it("obliterate, then remove adjacent to range start", () => {
			const helper = new ReconnectTestHelper();

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				events.push(deltaArgs.operation);
			});

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", 2, 5);
			helper.removeRange("B", 1, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "h world");
			assert.equal(helper.clients.C.getText(), "h world");
			// once range expansion is done: should only see the insert and obliterate events
			assert.equal(events.length, 3, `events: ${events.join(", ")}`);

			helper.logger.validate();
		});
		it("obliterate, then remove adjacent to range end", () => {
			const helper = new ReconnectTestHelper();

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				events.push(deltaArgs.operation);
			});

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", 2, 4);
			helper.removeRange("B", 4, 6);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "heworld");
			assert.equal(helper.clients.C.getText(), "heworld");
			// once range expansion is done: should only see the insert and obliterate events
			assert.equal(events.length, 3, `events: ${events.join(", ")}`);

			helper.logger.validate();
		});
		it("remove, then obliterate adjacent to range start", () => {
			const helper = new ReconnectTestHelper();

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				events.push(deltaArgs.operation);
			});

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.removeRange("A", 4, 6);
			helper.obliterateRange("B", 2, 4);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "heworld");
			assert.equal(helper.clients.C.getText(), "heworld");
			// not sure how eventing should look when remove is sequenced first
			assert.equal(events.length, 3, `events: ${events.join(", ")}`);

			helper.logger.validate();
		});
		it("remove, then obliterate adjacent to range end", () => {
			const helper = new ReconnectTestHelper();

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				events.push(deltaArgs.operation);
			});

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.removeRange("A", 2, 4);
			helper.obliterateRange("B", 4, 6);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "heworld");
			assert.equal(helper.clients.C.getText(), "heworld");
			// not sure how eventing should look when remove is sequenced first
			assert.equal(events.length, 3, `events: ${events.join(", ")}`);

			helper.logger.validate();
		});
	});

	describe("reconnect", () => {
		it("add text, disconnect, obliterate, reconnect, insert adjacent to obliterated range", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.disconnect(["C"]);
			helper.obliterateRangeLocal("C", 2, 4);
			helper.reconnect(["C"]);
			helper.processAllOps();
			// inserting in the middle for now
			helper.insertText("A", 3, "123");
			helper.processAllOps();

			// fails when I insert at 3, in the middle of the range/regardless of if
			// i processallops or not --> why doesn't the obliterate get resent?
			assert.equal(helper.clients.A.getText(), "he123 world");
			assert.equal(helper.clients.C.getText(), "he123 world");

			helper.logger.validate();
		});
		it("add text, disconnect, obliterate, insert adjacent to obliterated range, reconnect", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.disconnect(["C"]);
			helper.obliterateRangeLocal("C", 2, 4);
			// inserting in the middle for now
			helper.insertText("A", 3, "123");
			helper.reconnect(["C"]);
			helper.processAllOps();

			// same as above - as if the obliterate doesn't happen
			assert.equal(helper.clients.A.getText(), "he world");
			assert.equal(helper.clients.C.getText(), "he world");

			helper.logger.validate();
		});
	});
});
