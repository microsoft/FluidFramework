/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Side } from "../sequencePlace.js";

import { ReconnectTestHelper } from "./reconnectHelper.js";

function createObliterateTestBody({ action, expectedText }: ObliterateTestArgs): () => void {
	return () => {
		const events: number[] = [];

		const helper = new ReconnectTestHelper({
			mergeTreeEnableSidedObliterate: true,
		});
		helper.clients.A.on("delta", (opArgs, deltaArgs) => {
			events.push(deltaArgs.operation);
		});
		action(helper);
		helper.processAllOps();

		helper.logger.validate({ baseText: expectedText });
	};
}

interface ObliterateTestArgs {
	title: string;
	action: (helper: ReconnectTestHelper) => void;
	expectedText: string;
}

function itCorrectlyObliterates(args: ObliterateTestArgs): Mocha.Test {
	return it(args.title, createObliterateTestBody(args));
}
itCorrectlyObliterates.skip = (args: ObliterateTestArgs) =>
	it.skip(args.title, createObliterateTestBody(args));
itCorrectlyObliterates.only = (args: ObliterateTestArgs) =>
	it.only(args.title, createObliterateTestBody(args));

describe("obliterate", () => {
	itCorrectlyObliterates({
		title: "Obliterate adjacent insert",
		action: (helper) => {
			helper.insertText("A", 0, "|ABC>");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 0, side: Side.After }, { pos: 4, side: Side.Before });
			// not concurrent to A's obliterate - ops on the same client are never concurrent to one another
			// because they are all sequenced locally
			helper.insertText("A", 1, "AAA");
			helper.obliterateRange("B", { pos: 0, side: Side.After }, { pos: 4, side: Side.Before });
			helper.insertText("B", 1, "BBB");
		},
		expectedText: "|BBB>",
	});
	itCorrectlyObliterates({
		title: "Obliterate adjacent insert followed by obliterate",
		action: (helper) => {
			helper.insertText("A", 0, "0xx12345678");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 0, side: Side.After }, { pos: 2, side: Side.After });
			helper.obliterateRange("B", { pos: 0, side: Side.After }, { pos: 2, side: Side.After });
			// B won the obliterate, so this segment should be obliterated on insertion
			helper.insertText("A", 1, "AAAAAAAAAA");
			// Nonetheless, all clients should recognize that subsequent ops from A won't have realized this (until A's refSeq advances beyond
			// acking B's obliterate). At one point this caused 0xa3f because other clients didn't realize that the positions here still assume
			// existence of the 'AAAAAAAAAA' segment.
			helper.obliterateRange("A", { pos: 6, side: Side.After }, { pos: 15, side: Side.After });
			helper.processAllOps();
		},
		expectedText: "0678",
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
		expectedText: "XYZhe world",
	});
	describe("removes prior insert from same client", () => {
		itCorrectlyObliterates({
			title: "when the insert is unacked",
			action: (helper) => {
				helper.insertText("A", 0, "ABC");
				helper.obliterateRange(
					"A",
					{ pos: 0, side: Side.After },
					{ pos: 2, side: Side.Before },
				);
			},
			expectedText: "AC",
		});
		itCorrectlyObliterates({
			title: "when the insert is acked",
			action: (helper) => {
				helper.insertText("A", 0, "ABC");
				helper.processAllOps();
				helper.obliterateRange(
					"A",
					{ pos: 0, side: Side.After },
					{ pos: 2, side: Side.Before },
				);
			},
			expectedText: "AC",
		});
	});

	describe("does not remove subsequent insert from the same client", () => {
		itCorrectlyObliterates({
			title: "when the obliterate is unacked",
			action: (helper) => {
				helper.insertText("A", 0, "ABC");
				helper.obliterateRange(
					"A",
					{ pos: 0, side: Side.After },
					{ pos: 2, side: Side.Before },
				);
				helper.insertText("A", 1, "D");
			},
			expectedText: "ADC",
		});
		itCorrectlyObliterates({
			title: "when the obliterate is unacked",
			action: (helper) => {
				helper.insertText("A", 0, "ABC");
				helper.obliterateRange(
					"A",
					{ pos: 0, side: Side.After },
					{ pos: 2, side: Side.Before },
				);
				helper.processAllOps();
				helper.insertText("A", 1, "D");
			},
			expectedText: "ADC",
		});
	});

	itCorrectlyObliterates({
		title: "obliterate, then insert at the end of the string",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			helper.obliterateRange(
				"A",
				{ pos: 5, side: Side.Before },
				{ pos: 10, side: Side.After },
			);
			helper.insertText("B", 10, "123");
		},
		expectedText: "hello",
	});
	itCorrectlyObliterates({
		title: "insert, then obliterate at the end of the string",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			helper.insertText("A", 10, "123");
			helper.obliterateRange(
				"B",
				{ pos: 5, side: Side.Before },
				{ pos: 10, side: Side.After },
			);
		},
		expectedText: "hello",
	});
	itCorrectlyObliterates({
		title: "obliterate, then insert at the end of the string",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			helper.obliterateRange(
				"A",
				{ pos: 5, side: Side.Before },
				{ pos: 10, side: Side.After },
			);
			helper.insertText("B", 10, "123");
		},
		expectedText: "hello",
	});
	itCorrectlyObliterates({
		title: "insert, then obliterate at the end of the string",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();

			helper.insertText("A", 10, "123");
			helper.obliterateRange(
				"B",
				{ pos: 5, side: Side.Before },
				{ pos: 10, side: Side.After },
			);
		},
		expectedText: "hello",
	});
	describe("zero length", () => {
		// TODO: #17785: Allow start and end to be used as obliteration range endpoints.
		itCorrectlyObliterates.skip({
			title: "zero length obliterate at the start of the string",
			action: (helper) => {
				helper.insertText("A", 0, "hello world");
				helper.processAllOps();

				helper.obliterateRange(
					"A",
					{ pos: -1, side: Side.After },
					{ pos: 0, side: Side.Before },
				);
				helper.insertText("B", 0, "more ");
			},
			expectedText: "hello world",
		});
		itCorrectlyObliterates({
			title: "zero length obliterate in the middle of the string",
			action: (helper) => {
				helper.insertText("A", 0, "hello world");
				helper.processAllOps();

				helper.obliterateRange(
					"A",
					{ pos: 0, side: Side.After },
					{ pos: 1, side: Side.Before },
				);
				helper.insertText("B", 1, "more ");
			},
			expectedText: "hello world",
		});
		// TODO: #17785: Allow start and end to be used as obliteration range endpoints.
		itCorrectlyObliterates.skip({
			title: "zero length obliterate at the end of the string",
			action: (helper) => {
				helper.insertText("A", 0, "hello world");
				helper.processAllOps();

				helper.obliterateRange(
					"A",
					{ pos: helper.clients.A.getLength() - 1, side: Side.After },
					{ pos: -1, side: Side.Before },
				);
				helper.insertText("B", helper.clients.B.getLength(), " more");
			},
			expectedText: "hello world",
		});
	});
});

describe("overlapping edits", () => {
	itCorrectlyObliterates({
		title: "overlapping obliterate and obliterate",
		action: (helper) => {
			const text = "abcdef";

			helper.insertText("A", 0, text);
			helper.processAllOps();
			helper.obliterateRange(
				"A",
				{ pos: 0, side: Side.Before },
				{ pos: text.length - 1, side: Side.After },
			);
			helper.obliterateRange(
				"B",
				{ pos: 0, side: Side.Before },
				{ pos: text.length - 1, side: Side.After },
			);
		},
		expectedText: "",
	});
	itCorrectlyObliterates({
		title: "adjacent obliterates",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 3, side: Side.After });
			helper.obliterateRange("B", { pos: 4, side: Side.Before }, { pos: 5, side: Side.After });
		},
		expectedText: "heworld",
	});
	itCorrectlyObliterates({
		title: "remove within obliterated range",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 5, side: Side.After });
			helper.removeRange("B", 3, 4);
		},
		expectedText: "heworld",
	});
	itCorrectlyObliterates({
		title: "obliterate, then remove adjacent to range start",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 1, side: Side.After }, { pos: 5, side: Side.After });
			helper.removeRange("B", 1, 2);
		},
		expectedText: "hworld",
	});
	itCorrectlyObliterates({
		title: "obliterate, then remove adjacent to range end",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 2, side: Side.Before }, { pos: 4, side: Side.After });
			helper.removeRange("B", 4, 6);
		},
		expectedText: "heworld",
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
	});
	itCorrectlyObliterates({
		title: "remove, then obliterate adjacent to range end",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.removeRange("A", 2, 4);
			helper.obliterateRange("B", { pos: 3, side: Side.After }, { pos: 6, side: Side.After });
		},
		expectedText: "heorld",
	});

	// This test is somewhat arbitrary: it's a minimized fuzz test failure that ended up root-causing to an issue
	// in SortedSegmentSet (local references were not compared correctly when put at various offsets). We also have
	// more direct unit tests for that, but this is a good sanity check and adds some extra verification for concurrent obliterates.
	itCorrectlyObliterates({
		title: "overlapping obliterates with third client inserting",
		action: (helper) => {
			helper.insertText("A", 0, "0123456789");
			helper.processAllOps();
			helper.obliterateRange("A", { pos: 7, side: Side.After }, { pos: 8, side: Side.After });
			helper.obliterateRange("C", { pos: 1, side: Side.Before }, { pos: 8, side: Side.After });
			helper.insertText("B", 5, "V");
			helper.processAllOps();
		},
		expectedText: "09",
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
			helper.insertText("C", 8, "456");
		},
		expectedText: "he world",
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
			// ( 1]: after 0, after 1 => A( B] D C
			helper.obliterateRange("A", { pos: 0, side: Side.After }, { pos: 1, side: Side.After });
			// included in the range -- should get obliterated
			helper.insertText("B", 1, "E");
			// [1 ): before 1, before 2 => A E [B )C
			helper.obliterateRange(
				"B",
				{ pos: 1, side: Side.Before },
				{ pos: 3, side: Side.Before },
			);
		},
		expectedText: "AC",
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
			helper.insertText("C", 2, "123"); // he123llo world
			// for this to be interesting, might want to insert at 5
			helper.insertText("C", 8, "456"); // he123llo456 world
		},
		expectedText: "he world",
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

			helper.insertText("C", 2, "123"); // h e( 123 l l o] _ w o r l d
			helper.insertText("C", 8, "456"); // h e( 123 l l o) 456 _ w o r l d
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he456 world");
			assert.equal(helper.clients.B.getText(), "he456 world");
			assert.equal(helper.clients.C.getText(), "he456 world");

			helper.logger.validate();
		},
		expectedText: "he456 world",
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
			helper.insertText("C", 8, "456");

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "he123 world");
			assert.equal(helper.clients.B.getText(), "he123 world");
			assert.equal(helper.clients.C.getText(), "he123 world");

			helper.logger.validate();
		},
		expectedText: "he123 world",
	});
});
