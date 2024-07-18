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

	it("obliterate adjacent insert", () => {
		const helper = new ReconnectTestHelper();

		helper.insertText("A", 0, "|ABC>");
		helper.processAllOps();
		helper.obliterateRange("A", { pos: 0, side: 1 }, { pos: 4, side: 1 });
		// not concurrent to A's obliterate - ops on the same client are never concurrent to one another
		// because they are all sequenced locally
		helper.insertText("A", 1, "XYZ");
		helper.obliterateRange("B", { pos: 0, side: 1 }, { pos: 4, side: 1 });
		helper.insertText("B", 1, "XYZ");
		helper.processAllOps();

		// expected result once range expansion is done
		assert.equal(helper.clients.A.getText(), "|XYZ>");
		assert.equal(helper.clients.C.getText(), "|XYZ>");

		helper.logger.validate();
	});
	it("does not obliterate non-adjacent insert", () => {
		const helper = new ReconnectTestHelper();

		helper.insertText("A", 0, "hello world");
		helper.processAllOps();
		helper.obliterateRange("A", { pos: 2, side: 0 }, { pos: 4, side: 1 });
		// do not obliterate the XYZ - outside the obliterated range without expansion
		helper.insertText("B", 0, "XYZ");
		helper.processAllOps();

		// expected result once range expansion is done
		assert.equal(helper.clients.A.getText(), "XYZheo world");
		assert.equal(helper.clients.B.getText(), "XYZheo world");

		helper.logger.validate();
	});

	describe("overlapping edits", () => {
		it("overlapping obliterate and obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				events.push(deltaArgs.operation);
			});

			const text = "abcdef";

			helper.insertText("A", 0, text);
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 0, side: 0 }, { pos: text.length, side: 1 });
			helper.obliterateRange("B", { pos: 0, side: 0 }, { pos: text.length, side: 1 });
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
			helper.obliterateRange("A", { pos: 2, side: 0 }, { pos: 4, side: 1 });
			helper.obliterateRange("B", { pos: 4, side: 0 }, { pos: 6, side: 1 });
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
			helper.obliterateRange("A", { pos: 2, side: 0 }, { pos: 5, side: 1 });
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
			helper.obliterateRange("A", { pos: 1, side: 1 }, { pos: 5, side: 1 });
			helper.removeRange("B", 1, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "h world" /* he world */);
			assert.equal(helper.clients.C.getText(), "h world" /* he world */);
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
			helper.obliterateRange("A", { pos: 2, side: 0 }, { pos: 4, side: 1 });
			helper.removeRange("B", 4, 6);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "heworld" /* he world */);
			assert.equal(helper.clients.C.getText(), "heworld" /* he world */);
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
			helper.obliterateRange("B", { pos: 2, side: 0 }, { pos: 4, side: 1 });
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
			helper.obliterateRange("B", { pos: 3, side: 1 }, { pos: 6, side: 1 });
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
			const op = helper.obliterateRangeLocal("C", { pos: 1, side: 1 }, { pos: 4, side: 1 });
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", op);
			helper.processAllOps();
			// inserting adjacent to the obliterated range start
			helper.insertText("A", 2, "123");
			helper.processAllOps();

			// expected result once range expansion is done
			assert.equal(helper.clients.A.getText(), "heo world");
			assert.equal(helper.clients.C.getText(), "heo world");

			helper.logger.validate();
		});
		it("add text, disconnect, obliterate, insert adjacent to obliterated range, reconnect", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.disconnect(["C"]);
			const op = helper.obliterateRangeLocal("C", { pos: 1, side: 1 }, { pos: 4, side: 1 });
			// inserting adjacent to the obliterated range start
			helper.insertText("A", 2, "123");
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", op);
			helper.processAllOps();

			// expected result once range expansion is done
			assert.equal(helper.clients.A.getText(), "heo world");
			assert.equal(helper.clients.C.getText(), "heo world");

			helper.logger.validate();
		});
	});

	describe("sided obliterates", () => {
		/**
		 * All test cases will operate on the same numerical positions, but differ on their sidedness:
		 * 1. A expand both endpoints, B expand neither endpoint = expand range on both endpoints
		 * 2. A expand start endpoint, B expand end endpoint = either FWW/LWW
		 * 3. A expand both endpoints, B expand start = expand range on both endpoints
		 * 4. (similar to 3) A expand both endpoints, B expand end = expand range on both endpoints
		 * 5. A expand neither endpoint, B expand start = expand start endpoint
		 * 6. A expand neither endpoint, B expand end = expand end endpoint
		 * before = 0, after = 1
		 */
		it("1. A expand both endpoints, B expand neither endpoint", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			// in order to get the right behavior, the range needs to start after the previous position
			// if so, for a range ( 2, 4 ) it would need to be after 1 and before 5
			// h e( l l o )_ w o r l d
			helper.obliterateRange("A", { pos: 1, side: 1 }, { pos: 5, side: 0 });
			// [2, 4]: before 2, after 4 => h e [l l o] _ w o r l d
			helper.obliterateRange("B", { pos: 2, side: 0 }, { pos: 4, side: 1 });
			helper.insertText("C", 2, "123");
			helper.insertText("C", 5, "456");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he world");
			assert.equal(helper.clients.B.getText(), "he world");
			assert.equal(helper.clients.C.getText(), "he world");

			helper.logger.validate();
		});
		it("2. A expand start endpoint, B expand end endpoint", () => {
			// currently this is the example from obliterate notation loop doc
			// TODO: translate this into same format as others
			// i think this gets difficult when the range to obliterate > 1 character
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "ABC");
			helper.processAllOps();
			helper.insertText("A", 2, "D");
			// ( 1]: after 0, after 1 => A( B] C
			helper.obliterateRange("A", { pos: 0, side: 1 }, { pos: 2, side: 1 });
			// included in the range -- should get obliterated
			helper.insertText("B", 2, "E");
			// [1 ): before 1, before 2 => A [B )C
			helper.obliterateRange("B", { pos: 1, side: 1 }, { pos: 3, side: 0 });
			helper.processAllOps();

			// assumes FWW
			assert.equal(helper.clients.A.getText(), "ADC");
			assert.equal(helper.clients.B.getText(), "ADC");
			assert.equal(helper.clients.C.getText(), "ADC");

			helper.logger.validate();
		});
		it("3. A expand both endpoints, B expand start", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// ( 2, 4 ): after 1, before 5 => h e( l l o )_ w o r l d
			helper.obliterateRange("A", { pos: 1, side: 1 }, { pos: 5, side: 0 });
			// ( 2, 4]: after 1, after 4 => h e( l l o] _ w o r l d
			helper.obliterateRange("B", { pos: 2, side: 1 }, { pos: 4, side: 0 });
			helper.insertText("C", 2, "123");
			helper.insertText("C", 4, "456");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he world");
			assert.equal(helper.clients.B.getText(), "he world");
			assert.equal(helper.clients.C.getText(), "he world");

			helper.logger.validate();
		});
		it("4. A expand both endpoints, B expand end", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// ( 2, 4 ): after 1, before 5 => h e( l l o )_ w o r l d
			helper.obliterateRange("A", { pos: 1, side: 1 }, { pos: 5, side: 0 });
			// [2, 4 ): before 2, before 5 => h e [l l o )_ w o r l d
			helper.obliterateRange("B", { pos: 2, side: 0 }, { pos: 5, side: 0 });
			helper.insertText("C", 2, "123");
			helper.insertText("C", 4, "456");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he world");
			assert.equal(helper.clients.B.getText(), "he world");
			assert.equal(helper.clients.C.getText(), "he world");

			helper.logger.validate();
		});
		it("5. A expand neither endpoint, B expand start", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// [2, 4]: before 2, after 4 => h e [l l o] _ w o r l d
			helper.obliterateRange("A", { pos: 2, side: 0 }, { pos: 4, side: 1 });
			// ( 2, 4]: after 1, after 4 => h e( l l o] _ w o r l d
			helper.obliterateRange("B", { pos: 1, side: 1 }, { pos: 4, side: 1 });
			helper.insertText("C", 2, "123");
			helper.insertText("C", 5, "456");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he456 world");
			assert.equal(helper.clients.B.getText(), "he456 world");
			assert.equal(helper.clients.C.getText(), "he456 world");

			helper.logger.validate();
		});
		it("6. A expand neither endpoint, B expand end", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// [2, 4]: before 2, after 4 => h e [l l o] _ w o r l d
			helper.obliterateRange("A", { pos: 2, side: 0 }, { pos: 4, side: 1 });
			// [2, 4 ): before 2, before 5 => h e [l l o )_ w o r l d
			helper.obliterateRange("B", { pos: 2, side: 0 }, { pos: 5, side: 0 });
			helper.insertText("C", 2, "123");
			helper.insertText("C", 5, "456");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he123 world");
			assert.equal(helper.clients.B.getText(), "he123 world");
			assert.equal(helper.clients.C.getText(), "he123 world");

			helper.logger.validate();
		});
	});
});
