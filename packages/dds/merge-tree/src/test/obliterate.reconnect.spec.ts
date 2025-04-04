/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";

import { MergeTree } from "../mergeTree.js";

import { ClientTestHelper } from "./clientTestHelper.js";
import { useStrictPartialLengthChecks } from "./testUtils.js";

for (const { incremental, mergeTreeEnableSidedObliterate } of generatePairwiseOptions({
	incremental: [true, false],
	mergeTreeEnableSidedObliterate: [
		false,
		// TODO:AB#31001: Enable this once sided obliterate supports reconnect.
		// true,
	],
})) {
	describe(`obliterate partial lengths incremental = ${incremental} enableSidedObliterate = ${mergeTreeEnableSidedObliterate}`, () => {
		useStrictPartialLengthChecks();

		beforeEach(() => {
			MergeTree.options.incrementalUpdate = incremental;
		});

		afterEach(() => {
			MergeTree.options.incrementalUpdate = true;
		});

		it("obliterate does not expand during rebase", () => {
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
			const helper = new ClientTestHelper({ mergeTreeEnableSidedObliterate });

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
