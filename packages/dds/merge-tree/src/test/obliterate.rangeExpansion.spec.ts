/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Side } from "../sequencePlace.js";

import { ReconnectTestHelper } from "./reconnectHelper.js";

function itCorrectlyObliterates({
	title,
	action,
	expectedText,
	expectedEventCount,
}: {
	title: string;
	action: (helper: ReconnectTestHelper) => void;
	expectedText: string;
	expectedEventCount: number;
}): Mocha.Test {
	return it(title, () => {
		const events: number[] = [];

		const helper = new ReconnectTestHelper();
		helper.clients.A.on("delta", (opArgs, deltaArgs) => {
			events.push(deltaArgs.operation);
		});
		action(helper);
		helper.processAllOps();
		assert.equal(helper.clients.A.getText(), expectedText);
		assert.equal(helper.clients.B.getText(), expectedText);
		assert.equal(helper.clients.C.getText(), expectedText);
		assert.equal(events.length, expectedEventCount, `events: ${events.join(", ")}`);

		helper.logger.validate();
	});
}

describe.skip("obliterate", () => {
	itCorrectlyObliterates({
		title: "obliterate adjacent insert",
		action: (helper) => {
			helper.insertText("A", 0, "|ABC>");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 0, side: Side.After }, { pos: 4, side: Side.After });
			// not concurrent to A's obliterate - ops on the same client are never concurrent to one another
			// because they are all sequenced locally
			helper.insertText("A", 1, "XYZ");
			helper.obliterateRange("B", { pos: 0, side: Side.After }, { pos: 4, side: Side.After });
			helper.insertText("B", 1, "XYZ");
		},
		expectedText: "|XYZ>",
		expectedEventCount: 3,
	});
	itCorrectlyObliterates({
		title: "does not obliterate non-adjacent insert",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
			// do not obliterate the XYZ - outside the obliterated range without expansion
			helper.insertText("B", 0, "XYZ");
		},
		expectedText: "XYZheo world",
		expectedEventCount: 3,
	});
});

describe.skip("overlapping edits", () => {
	itCorrectlyObliterates({
		title: "overlapping obliterate and obliterate",
		action: (helper) => {
			const text = "abcdef";

			helper.insertText("A", 0, text);
			helper.processAllOps();
			helper.obliterateRange(
				"A",
				{ pos: 0, side: Side.Before },
				{ pos: text.length, side: Side.After },
			);
			helper.obliterateRange(
				"B",
				{ pos: 0, side: Side.Before },
				{ pos: text.length, side: Side.After },
			);
		},
		expectedText: "",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "adjacent obliterates",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
			helper.obliterateRange("B", { pos: 4, side: Side.Before }, { pos: 6, side: Side.After });
		},
		expectedText: "heworld",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "remove within obliterated range",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 5, side: Side.After });
			helper.removeRange("B", 3, 4);
		},
		expectedText: "he world",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "obliterate, then remove adjacent to range start",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 1, side: Side.After }, { pos: 5, side: Side.After });
			helper.removeRange("B", 1, 2);
		},
		expectedText: "he world",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "obliterate, then remove adjacent to range end",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
			helper.removeRange("B", 4, 6);
		},
		expectedText: "he world",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "remove, then obliterate adjacent to range start",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.removeRange("A", 4, 6);
			helper.obliterateRange("B", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
		},
		expectedText: "heworld",
		expectedEventCount: 3,
	});
	itCorrectlyObliterates({
		title: "remove, then obliterate adjacent to range end",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.removeRange("A", 2, 4);
			helper.obliterateRange("B", { pos: 3, side: Side.After }, { pos: 6, side: Side.After });
		},
		expectedText: "heworld",
		expectedEventCount: 3,
	});
});

describe.skip("reconnect", () => {
	itCorrectlyObliterates({
		title: "add text, disconnect, obliterate, reconnect, insert adjacent to obliterated range",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.disconnect(["C"]);
			const op = helper.obliterateRangeLocal(
				"C",
				{ pos: 1, side: Side.After },
				{ pos: 4, side: Side.After },
			);
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", op);
			helper.processAllOps();
			// inserting adjacent to the obliterated range start
			helper.insertText("A", 2, "123");
		},
		expectedText: "heo world",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "add text, disconnect, obliterate, insert adjacent to obliterated range, reconnect",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.disconnect(["C"]);
			const op = helper.obliterateRangeLocal(
				"C",
				{ pos: 1, side: Side.After },
				{ pos: 4, side: Side.After },
			);
			// inserting adjacent to the obliterated range start
			helper.insertText("A", 2, "123");
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", op);
		},
		expectedText: "heo world",
		expectedEventCount: 2,
	});
});

describe.skip("sided obliterates", () => {
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
	itCorrectlyObliterates({
		title: "1. A expand both endpoints, B expand neither endpoint",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			// in order to get the right behavior, the range needs to start after the previous position
			// if so, for a range ( 2, 4 ) itCorrectlyObliterates would need to be after 1 and before 5
			// h e( l l o )_ w o r l d
			helper.obliterateRange("A", { pos: 1, side: Side.After }, { pos: 5, side: Side.Before });
			// [2, 4]: before 2, after 4 => h e [l l o] _ w o r l d
			helper.obliterateRange("B", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
			helper.insertText("C", 2, "123");
			helper.insertText("C", 5, "456");
		},
		expectedText: "he world",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "2. A expand start endpoint, B expand end endpoint",
		action: (helper) => {
			// currently this is the example from obliterate notation loop doc
			// TODO: translate this into same format as others
			// i think this gets difficult when the range to obliterate > 1 character
			helper.insertText("A", 0, "ABC");
			helper.processAllOps();
			helper.insertText("A", 2, "D");
			// ( 1]: after 0, after 1 => A( B] C
			helper.obliterateRange("A", { pos: 0, side: Side.After }, { pos: 2, side: Side.After });
			// included in the range -- should get obliterated
			helper.insertText("B", 2, "E");
			// [1 ): before 1, before 2 => A [B )C
			helper.obliterateRange("B", { pos: 1, side: Side.After }, { pos: 3, side: Side.Before });
		},
		expectedText: "ADC",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "3. A expand both endpoints, B expand start",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// ( 2, 4 ): after 1, before 5 => h e( l l o )_ w o r l d
			helper.obliterateRange("A", { pos: 1, side: Side.After }, { pos: 5, side: Side.Before });
			// ( 2, 4]: after 1, after 4 => h e( l l o] _ w o r l d
			helper.obliterateRange("B", { pos: 2, side: Side.After }, { pos: 4, side: Side.Before });
			helper.insertText("C", 2, "123");
			// for this to be interesting, might want to insert at 5
			helper.insertText("C", 4, "456");
		},
		expectedText: "he world",
		expectedEventCount: 2,
	});
	itCorrectlyObliterates({
		title: "4. A expand both endpoints, B expand end",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// ( 2, 4 ): after 1, before 5 => h e( l l o )_ w o r l d
			helper.obliterateRange("A", { pos: 1, side: Side.After }, { pos: 5, side: Side.Before });
			// [2, 4 ): before 2, before 5 => h e [l l o )_ w o r l d
			helper.obliterateRange(
				"B",
				{ pos: 2, side: Side.Before },
				{ pos: 5, side: Side.Before },
			);
			helper.insertText("C", 2, "123");
			// for this to be interesting, might want to insert at 5
			helper.insertText("C", 4, "456");
		},
		expectedText: "he world",
		expectedEventCount: 3,
	});
	itCorrectlyObliterates({
		title: "5. A expand neither endpoint, B expand start",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// [2, 4]: before 2, after 4 => h e [l l o] _ w o r l d
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
			// ( 2, 4]: after 1, after 4 => h e( l l o] _ w o r l d
			helper.obliterateRange("B", { pos: 1, side: Side.After }, { pos: 4, side: Side.After });
			helper.insertText("C", 2, "123");
			helper.insertText("C", 5, "456");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he456 world");
			assert.equal(helper.clients.B.getText(), "he456 world");
			assert.equal(helper.clients.C.getText(), "he456 world");

			helper.logger.validate();
		},
		expectedText: "he456 world",
		expectedEventCount: 3,
	});
	itCorrectlyObliterates({
		title: "6. A expand neither endpoint, B expand end",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			// [2, 4]: before 2, after 4 => h e [l l o] _ w o r l d
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
			// [2, 4 ): before 2, before 5 => h e [l l o )_ w o r l d
			helper.obliterateRange(
				"B",
				{ pos: 2, side: Side.Before },
				{ pos: 5, side: Side.Before },
			);
			helper.insertText("C", 2, "123");
			helper.insertText("C", 5, "456");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he123 world");
			assert.equal(helper.clients.B.getText(), "he123 world");
			assert.equal(helper.clients.C.getText(), "he123 world");

			helper.logger.validate();
		},
		expectedText: "he123 world",
		expectedEventCount: 3,
	});
});
