/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { PartialSequenceLengths, verify, verifyExpected } from "../partialLengths";
import { MergeTree } from "../mergeTree";
import { ReconnectTestHelper } from "./reconnectHelper";

for (const incremental of [true, false]) {
	describe(`obliterate partial lengths incremental = ${incremental}`, () => {
		beforeEach(() => {
			PartialSequenceLengths.options.verifier = verify;
			PartialSequenceLengths.options.verifyExpected = verifyExpected;
			MergeTree.options.incrementalUpdate = incremental;
		});

		afterEach(() => {
			PartialSequenceLengths.options.verifier = undefined;
			PartialSequenceLengths.options.verifyExpected = undefined;
			MergeTree.options.incrementalUpdate = true;
		});

		it("obliterate does not expand during rebase", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.removeRange("B", 0, 3);
			helper.disconnect(["C"]);
			const cOp = helper.obliterateRangeLocal("C", 0, 1);
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", cOp);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "D");

			helper.logger.validate();
		});

		it("does not delete reconnected insert into obliterate range if insert is rebased", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 3);
			helper.disconnect(["C"]);
			const cOp = helper.insertTextLocal("C", 2, "aaa");
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", cOp);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "aaaD");
			assert.equal(helper.clients.C.getText(), "aaaD");

			helper.logger.validate();
		});

		it("deletes reconnected insert into obliterate range when entire string deleted if rebased", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 4);
			helper.disconnect(["C"]);
			const cOp = helper.insertTextLocal("C", 2, "aaa");
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", cOp);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "aaa");
			assert.equal(helper.clients.C.getText(), "aaa");

			helper.logger.validate();
		});

		it("obliterates local segment while disconnected", () => {
			const helper = new ReconnectTestHelper();

			// [C]-D-(E)-F-H-G-B-A

			helper.insertText("B", 0, "A");

			helper.disconnect(["C"]);
			const op0 = helper.insertTextLocal("C", 0, "B");
			const op1 = helper.insertTextLocal("C", 0, "CDEFG");
			const op2 = helper.removeRangeLocal("C", 0, 1);
			const op3 = helper.obliterateRangeLocal("C", 1, 2);
			const op4 = helper.insertTextLocal("C", 2, "H");

			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", op0);
			helper.submitDisconnectedOp("C", op1);
			helper.submitDisconnectedOp("C", op2);
			helper.submitDisconnectedOp("C", op3);
			helper.submitDisconnectedOp("C", op4);

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "DFHGBA");

			helper.logger.validate();
		});

		it("deletes concurrently inserted segment between separated group ops", () => {
			const helper = new ReconnectTestHelper();

			// B-A
			// (B-C-A)

			helper.insertText("A", 0, "A");
			helper.insertText("A", 0, "B");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("A", 1, "C");

			helper.disconnect(["B"]);
			const op = helper.obliterateRangeLocal("B", 0, 2);
			helper.reconnect(["B"]);
			helper.submitDisconnectedOp("B", op);

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("removes correct number of pending segments", () => {
			const helper = new ReconnectTestHelper();

			// (BC)-[A]

			const op0 = helper.insertTextLocal("A", 0, "A");
			const op1 = helper.insertTextLocal("A", 1, "BC");
			const op2 = helper.obliterateRangeLocal("A", 0, 2);

			helper.submitDisconnectedOp("A", op0);
			helper.submitDisconnectedOp("A", op1);
			helper.submitDisconnectedOp("A", op2);

			helper.removeRange("A", 0, 1);

			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("doesn't do obliterate ack traversal when starting segment has been acked", () => {
			const helper = new ReconnectTestHelper();

			// AB
			// (E)-[F]-(G-D-(C-A)-B)

			helper.insertText("B", 0, "AB");
			helper.processAllOps();
			helper.logger.validate();

			const op0 = helper.insertTextLocal("A", 0, "C");
			const op1 = helper.obliterateRangeLocal("A", 0, 2);
			helper.submitDisconnectedOp("A", op0);
			helper.submitDisconnectedOp("A", op1);

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
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 3);
			helper.disconnect(["C"]);
			const cOp = helper.insertTextLocal("C", 0, "aaa");
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", cOp);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "aaaD");
			assert.equal(helper.clients.C.getText(), "aaaD");

			helper.logger.validate();
		});

		it("does not delete reconnected insert at end of obliterate range", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 3);
			helper.disconnect(["C"]);
			const cOp = helper.insertTextLocal("C", 3, "aaa");
			helper.reconnect(["C"]);
			helper.submitDisconnectedOp("C", cOp);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "aaaD");

			helper.logger.validate();
		});
	});
}
