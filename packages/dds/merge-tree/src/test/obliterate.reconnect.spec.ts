/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MergeTree } from "../mergeTree.js";

import { itCorrectlyObliterates, useStrictPartialLengthChecks } from "./testUtils.js";
import { PartialSyncTestHelper } from "./partialSyncHelper.js";
import { PartialSyncTestHelper as ReconnectTestHelper } from "./partialSyncHelper.js";
import { Side } from "../sequencePlace.js";

for (const incremental of [true, false]) {
	describe.only(`obliterate partial lengths incremental = ${incremental}`, () => {
		useStrictPartialLengthChecks();

		beforeEach(() => {
			MergeTree.options.incrementalUpdate = incremental;
		});

		afterEach(() => {
			MergeTree.options.incrementalUpdate = true;
		});

		it("obliterate does not expand during rebase", () => {
			const helper = new PartialSyncTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.removeRange("B", 0, 3);
			helper.disconnect("C");
			helper.obliterateRange("C", 0, 1);
			helper.reconnect("C");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "D");

			helper.logger.validate();
		});

		it("does delete reconnected insert into obliterate range if insert is rebased", () => {
			const helper = new PartialSyncTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 3);
			helper.disconnect("C");
			helper.insertText("C", 2, "aaa");
			helper.reconnect("C");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "D");
			assert.equal(helper.clients.C.getText(), "D");

			helper.logger.validate();
		});

		it("deletes reconnected insert into obliterate range when entire string deleted if rebased", () => {
			const helper = new PartialSyncTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 4);
			helper.disconnect("C");
			helper.insertText("C", 2, "aaa");
			helper.reconnect("C");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("obliterates local segment while disconnected", () => {
			const helper = new PartialSyncTestHelper();

			// [C]-D-(E)-F-H-G-B-A

			helper.insertText("B", 0, "A");

			helper.disconnect("C");
			helper.insertText("C", 0, "B");
			helper.insertText("C", 0, "CDEFG");
			helper.removeRange("C", 0, 1);
			helper.obliterateRange("C", 1, 2);
			helper.insertText("C", 2, "H");

			helper.reconnect("C");

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "DFHGBA");

			helper.logger.validate();
		});

		it("deletes concurrently inserted segment between separated group ops", () => {
			const helper = new PartialSyncTestHelper();

			// B-A
			// (B-C-A)

			helper.insertText("A", 0, "A");
			helper.insertText("A", 0, "B");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("A", 1, "C");

			helper.disconnect("B");
			helper.obliterateRange("B", 0, 2);
			helper.reconnect("B");

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("removes correct number of pending segments", () => {
			const helper = new PartialSyncTestHelper();

			// (BC)-[A]

			helper.disconnect("A");
			helper.insertText("A", 0, "A");
			helper.insertText("A", 1, "BC");
			helper.obliterateRange("A", 0, 2);
			helper.reconnect("A");

			helper.removeRange("A", 0, 1);

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("doesn't do obliterate ack traversal when starting segment has been acked", () => {
			const helper = new PartialSyncTestHelper();

			// AB
			// (E)-[F]-(G-D-(C-A)-B)

			helper.insertText("B", 0, "AB");
			helper.processAllOps();
			helper.logger.validate();

			helper.disconnect("A");
			helper.insertText("A", 0, "C");
			helper.obliterateRange("A", 0, 2);
			helper.reconnect("A");

			helper.insertText("B", 0, "D");
			helper.insertText("A", 0, "EFG");
			helper.obliterateRange("A", 0, 1);
			helper.removeRange("A", 0, 1);
			helper.obliterateRange("A", 0, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("does not delete reconnected insert at start of obliterate range if rebased", () => {
			const helper = new PartialSyncTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 3);
			helper.disconnect("C");
			helper.insertText("C", 0, "aaa");
			helper.reconnect("C");

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "aaaD");
			assert.equal(helper.clients.C.getText(), "aaaD");

			helper.logger.validate();
		});

		it("does not delete reconnected insert at end of obliterate range", () => {
			const helper = new PartialSyncTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 3);
			helper.disconnect("C");
			helper.insertText("C", 3, "aaa");
			helper.reconnect("C");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "aaaD");

			helper.logger.validate();
		});
	});
}

describe("sided obliterate reconnect", () => {
	itCorrectlyObliterates({
		title: "add text, disconnect, obliterate, reconnect, insert adjacent to obliterated range",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.disconnect("C");
			helper.obliterateRange("C", { pos: 1, side: Side.After }, { pos: 4, side: Side.After });
			// inserting adjacent to the obliterated range start
			helper.reconnect("C");
			helper.insertText("A", 2, "123");
		},
		expectedText: "he world",
	});
	itCorrectlyObliterates({
		title: "add text, disconnect, obliterate, insert adjacent to obliterated range, reconnect",
		action: (helper) => {
			helper.insertText("A", 0, "hello world");
			helper.processAllOps();
			helper.disconnect("C");
			helper.obliterateRange("C", { pos: 1, side: Side.After }, { pos: 4, side: Side.After });
			// inserting adjacent to the obliterated range start
			helper.insertText("A", 2, "123");
			helper.reconnect("C");
		},
		expectedText: "he world",
	});

	describe("obliterate rebasing over", () => {
		for (const { removalType, getRemoveMethod } of [
			{
				removalType: "remove",
				getRemoveMethod: (helper: ReconnectTestHelper): ReconnectTestHelper["removeRange"] =>
					helper.removeRange.bind(helper),
			},
			{
				removalType: "obliterate",
				getRemoveMethod: (helper: ReconnectTestHelper): ReconnectTestHelper["removeRange"] =>
					helper.obliterateRange.bind(helper),
			},
		]) {
			itCorrectlyObliterates({
				title: `${removalType} overlapping obliterate start`,
				action: (helper) => {
					helper.insertText("A", 0, "0123456789");
					helper.processAllOps();
					helper.disconnect("B");
					helper.obliterateRange(
						"B",
						{ pos: 1, side: Side.Before },
						{ pos: 8, side: Side.After },
					);
					helper.insertText("A", 5, "should be obliterated");
					getRemoveMethod(helper)("A", 0, 2);
					helper.reconnect("B");
				},
				expectedText: "9",
			});

			itCorrectlyObliterates({
				title: `${removalType} overlapping obliterate middle`,
				action: (helper) => {
					helper.insertText("A", 0, "0123456789");
					helper.processAllOps();
					helper.disconnect("B");
					helper.obliterateRange(
						"B",
						{ pos: 1, side: Side.Before },
						{ pos: 8, side: Side.After },
					);
					getRemoveMethod(helper)("A", 3, 4);
					helper.insertText("A", 5, "should be obliterated");
					helper.reconnect("B");
				},
				expectedText: "09",
			});

			itCorrectlyObliterates({
				title: `${removalType} overlapping obliterate end`,
				action: (helper) => {
					helper.insertText("A", 0, "0123456789");
					helper.processAllOps();
					helper.disconnect("B");
					helper.obliterateRange(
						"B",
						{ pos: 1, side: Side.Before },
						{ pos: 8, side: Side.After },
					);
					getRemoveMethod(helper)("A", 8, 10);
					helper.insertText("A", 5, "should be obliterated");
					helper.reconnect("B");
				},
				expectedText: "0",
			});
		}
	});

	// This test and the analogous endpoint test below provide some rationale for the policy of tending to shrink obliterates
	// inward upon reconnect in the case that regions near their endpoints were removed between the original submission and resubmission.
	itCorrectlyObliterates({
		title: "obliterate shrinks start point to best possible option",
		action: (helper) => {
			helper.insertText("A", 0, "0123456789");
			helper.processAllOps();
			helper.disconnect("B");
			helper.obliterateRange("B", { pos: 3, side: Side.After }, { pos: 8, side: Side.Before }); // 4 through 7
			helper.insertText("A", 7, "inside the original obliterate");
			helper.removeRange("C", 1, 5); // 1234
			helper.advanceClients("B");
			// B recognizes an observer client at this seq will have '056inside the original obliterate789' and B's obliterate should additionally
			// remove '5inside the original obliterate67'.
			// It reconnects at this point and has a choice: it can either specify the startpoing of the obliterate as 'after the 0 character'
			// (preserving the original side) or 'before the 5 character' (which will make its start endpoint no longer "sticky" like
			// the original one). Seeing as the original startpoint has actually already been removed, we should choose the latter.
			helper.reconnect("B");
			// The possibility of another client doing something like this is additional justification for this policy:
			// (point being that B will see this segment as clearly after the "0" character since it was inserted before the 3 in the original string)
			helper.insertText(
				"A",
				3,
				"outside the original obliterate but in danger of being in the new one",
			);
		},
		expectedText: "0outside the original obliterate but in danger of being in the new one89",
	});

	itCorrectlyObliterates({
		title: "obliterate shrinks end point to best possible option",
		action: (helper) => {
			helper.insertText("A", 0, "0123456789");
			helper.processAllOps();
			helper.disconnect("B");
			helper.obliterateRange("B", { pos: 3, side: Side.After }, { pos: 8, side: Side.Before }); // 4 through 7
			helper.insertText("A", 7, "inside the original obliterate");
			helper.removeRange("C", 6, 9); // 678
			helper.advanceClients("B");
			// B recognizes an observer client at this seq will have '056inside the original obliterate789' and B's obliterate should additionally
			// remove '5inside the original obliterate67'.
			// It reconnects at this point and has a choice: it can either specify the startpoing of the obliterate as 'after the 0 character'
			// (preserving the original side) or 'before the 5 character' (which will make its start endpoint no longer "sticky" like
			// the original one). Seeing as the original startpoint has actually already been removed, we should choose the latter.
			helper.reconnect("B");
			// The possibility of another client doing something like this is additional justification for this policy:
			// (point being that B will see this segment as clearly after the "0" character since it was inserted before the 3 in the original string)
			helper.insertText(
				"A",
				9 + "inside the original obliterate".length,
				"outside the original obliterate but in danger of being in the new one",
			);
		},
		expectedText: "0123outside the original obliterate but in danger of being in the new one9",
	});

	itCorrectlyObliterates({
		title: "recomputes obliterate tiebreak winner",
		action: (helper) => {
			helper.insertText("A", 0, "ABCDEFGHIJKLMNOPQ");
			helper.processAllOps();
			helper.disconnect("B");
			helper.obliterateRange("D", { pos: 0, side: Side.Before }, { pos: 6, side: Side.After }); // ABCDEFG
			helper.obliterateRange("C", { pos: 2, side: Side.Before }, { pos: 8, side: Side.After }); // CDEFGHI
			helper.obliterateRange("B", { pos: 3, side: Side.After }, { pos: 4, side: Side.After }); // D
			// This insertion position by B is critically inside the range that B originally obliterated, but that will no longer be the case
			// later on when B reconnects, since the region B wanted to obliterate will be gone (so there is no way to specify the same obliterate).
			helper.insertText("B", 4, "should go away");
			helper.processAllOps();
			helper.removeRange("C", 0, 1); // J
			helper.insertText("C", 0, "01234567"); // C now sees '01234567KLMNOPQ'
			helper.processAllOps();
			// B now needs to recognize that it no longer necessarily has 'last-write-win' privilege over its insertion
			// in the event that the new insertion position was obliterated concurrently to the op it's about to (re)submit.
			helper.reconnect("B");
			// ... and indeed, in this case A has obliterated a region containing the "should go away" B inserted.
			helper.obliterateRange("A", { pos: 7, side: Side.After }, { pos: 9, side: Side.Before }); // K in '01234567KLMNOPQ', expanding on both ends
		},
		expectedText: "01234567LMNOPQ",
	});

	// This test case demonstrates the need to 'pre-compute' the result of rebasing obliterate endpoints upon reconnection
	// before segment order is normalized.
	// TODO: AB#34898: This seems to demonstrate an issue with segment normalization which should be investigated.
	// Resolving that work item may involve including this as a test case targeted at segment ordering instead, and finding an analogous case
	// where legitimate segment reording could affect obliterate rebasing.
	itCorrectlyObliterates({
		title: "computes obliterate rebases before segment normalization",
		action: (helper) => {
			helper.insertText("A", 0, "0ABCDEFGHIJKLMNOPQRSTUVWXYZ");
			helper.processAllOps();
			helper.disconnect("B");
			helper.obliterateRange(
				"B",
				{ pos: 9, side: Side.Before },
				{ pos: 26, side: Side.After },
			); // I through Z inclusive
			helper.insertText("B", 3, "e"); // between "B" and "C"
			helper.obliterateRange("B", { pos: 2, side: Side.After }, { pos: 6, side: Side.After }); // the inserted 'e' through F inclusive
			helper.obliterateRange(
				"A",
				{ pos: 4, side: Side.After },
				{ pos: 15, side: Side.Before },
			); // E through N inclusive
			helper.processAllOps();
			// Before reconnecting, B's segment order is:
			// 0ABeCDEFGHIJKLMNOPQRSTUVWXYZ
			// B has issued obliterates for:
			// 0ABeCDEFGHIJKLMNOPQRSTUVWXYZ
			//   (    ]  [                ]
			// and it sees that A has already obliterated:
			// 0ABeCDEFGHIJKLMNOPQRSTUVWXYZ
			//      (          )

			// Segment normalization on B will reorder "eCDEFGHIJKLMNOPQRSTUVWXYZ" to "eCDOPQRSTUVWXYZEFGHIJKLMN"
			// (note that this seems unnecessary and is why AB#34898 is filed)
			helper.reconnect("B");
		},
		expectedText: "0AB",
	});
});
