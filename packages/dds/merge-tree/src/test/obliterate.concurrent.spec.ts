/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { LoggingError } from "@fluidframework/telemetry-utils";
import { MergeTree } from "../mergeTree.js";
import { ReconnectTestHelper } from "./reconnectHelper.js";
import { useStrictPartialLengthChecks } from "./testUtils.js";

/**
 * Some tests contain ASCII diagrams of the trees to make it easier to reason about
 * structure. The format of these diagrams is this:
 * - segments are separated by `-`.
 * - removed ranges are surrounded by `[` ... `]`
 * - obliterated ranges are surrounded by `(` ... `)`
 *
 * In cases where these ranges are ambiguous, there are additional diagrams
 * containing `v` and `-`, with the `v` denoting the start and end of the range
 *
 * E.g.
 *
 * ```
 * v---v
 * [ABC]
 * ```
 *
 * This diagram describes a single segment, `ABC`, that has been removed.
 *
 *
 * ```
 * v-----v
 *  v---v
 * [[ABC]]
 * ```
 *
 * This diagram describes a single segment, `ABC`, that has been concurrently
 * removed by two clients.
 */

for (const incremental of [true, false]) {
	describe(`obliterate partial lengths incremental = ${incremental}`, () => {
		useStrictPartialLengthChecks();

		beforeEach(() => {
			MergeTree.options.incrementalUpdate = incremental;
		});

		afterEach(() => {
			MergeTree.options.incrementalUpdate = true;
		});

		it("length of children does not differ from parent when overlapping remove+obliterate", () => {
			const helper = new ReconnectTestHelper();

			// ABCDEFGH
			// I-[J]-(KLM-[ABC]-D-123456-E-[FG]-H)

			helper.insertText("A", 0, "ABCDEFGH");
			helper.processAllOps();
			helper.removeRange("C", 0, 3);
			helper.insertText("C", 1, "123456");
			helper.removeRange("A", 5, 7);
			helper.insertText("A", 0, "IJKLM");
			helper.obliterateRange("A", 2, 11);
			helper.removeRange("A", 1, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "I");

			helper.logger.validate();
		});

		it("deletes concurrent insert that occurs after obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 4);
			helper.insertText("C", 2, "X");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("deletes concurrent insert that occurs before obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.insertText("C", 2, "X");
			helper.obliterateRange("B", 0, 4);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("does not delete unacked segment at start of string", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "ABC");
			helper.obliterateRange("C", 2, 3);
			helper.insertText("B", 0, "X");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "XAB");
			assert.equal(helper.clients.B.getText(), "XAB");
			assert.equal(helper.clients.C.getText(), "XAB");

			helper.logger.validate();
		});

		it("throws when local obliterate has range end outside length of local string", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "A");
			helper.insertText("C", 0, "B");

			try {
				helper.obliterateRange("C", 0, 2);
				assert.fail("should not be possible to obliterate outside local range");
			} catch (e) {
				assert(e instanceof LoggingError);
				assert.equal(e.message, "RangeOutOfBounds");
			}
		});

		it("does not delete when obliterate immediately after insert", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "A");
			helper.obliterateRange("C", 0, 1);
			helper.insertText("B", 0, "W");
			helper.insertText("C", 0, "D");
			helper.obliterateRange("C", 0, 1);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "W");
			assert.equal(helper.clients.B.getText(), "W");
			assert.equal(helper.clients.C.getText(), "W");

			helper.logger.validate();
		});

		it("does not delete remote insert when between local insert+obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "X");
			helper.obliterateRange("C", 0, 1);
			helper.insertText("C", 0, "B");
			helper.obliterateRange("C", 0, 1);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "X");
			assert.equal(helper.clients.B.getText(), "X");
			assert.equal(helper.clients.C.getText(), "X");

			helper.logger.validate();
		});

		it("does not delete remote insert when between local insert+obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "A");
			helper.obliterateRange("C", 0, 1);
			helper.insertText("B", 0, "B");
			helper.insertText("C", 0, "X");
			helper.obliterateRange("B", 0, 1);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "X");
			assert.equal(helper.clients.B.getText(), "X");
			assert.equal(helper.clients.C.getText(), "X");

			helper.logger.validate();
		});

		it("does not delete remote insert when in middle of segment", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "ABC");
			helper.obliterateRange("C", 2, 3);
			helper.obliterateRange("C", 0, 1);
			helper.insertText("B", 0, "X");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "XB");
			assert.equal(helper.clients.B.getText(), "XB");
			assert.equal(helper.clients.C.getText(), "XB");

			helper.logger.validate();
		});

		it("deletes segment inserted into locally obliterated segment", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "X");
			helper.insertText("C", 0, "B");
			helper.obliterateRange("C", 0, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("updates lengths after obliterated insertion", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "X");
			helper.insertText("C", 0, "N");
			helper.obliterateRange("C", 0, 2);
			helper.insertText("B", 1, "B");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			assert.equal(helper.clients.A.getLength(), 0);
			assert.equal(helper.clients.B.getLength(), 0);
			assert.equal(helper.clients.C.getLength(), 0);

			helper.logger.validate();
		});

		it("updates lengths when insertion causes tree to split", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "0");
			helper.insertText("C", 0, "123");
			helper.insertText("B", 0, "BB");
			helper.insertText("C", 0, "GGG");
			helper.obliterateRange("C", 2, 5);
			helper.insertText("B", 1, "A");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText().length, helper.clients.A.getLength());
			assert.equal(helper.clients.B.getText().length, helper.clients.B.getLength());
			assert.equal(helper.clients.C.getText().length, helper.clients.C.getLength());

			assert.equal(helper.clients.A.getText(), "GG30");

			helper.logger.validate();
		});

		it("length of node split by insertion does not count remotely obliterated segments", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "1");
			helper.insertText("A", 0, "2");
			helper.insertText("C", 0, "XXXX");
			helper.insertText("B", 0, "ABC");
			helper.insertText("C", 0, "GGG");
			helper.obliterateRange("C", 2, 6);
			helper.insertText("C", 1, "D");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "GDGX21");
			assert.equal(helper.clients.C.getText(), "GDGX21");

			helper.logger.validate();
		});

		it("length of node split by obliterate does not count remotely obliterated segments", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "1");
			helper.insertText("A", 0, "2");
			helper.insertText("C", 0, "XXXX");
			helper.insertText("B", 0, "A");
			helper.insertText("C", 0, "GGG");
			helper.obliterateRange("C", 2, 6);
			helper.insertText("C", 1, "C");
			helper.insertText("B", 1, "D");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "GCGX21");
			assert.equal(helper.clients.B.getText(), "GCGX21");

			helper.logger.validate();
		});

		it("counts remotely but not concurrently inserted segments for length when tree is split", () => {
			const helper = new ReconnectTestHelper();

			// a-b-c-d-e-123
			// (a-b)-c-d-e-1-[2]-3

			helper.insertText("B", 0, "123");
			helper.insertText("C", 0, "e");
			helper.insertText("C", 0, "d");
			helper.insertText("C", 0, "c");
			helper.insertText("C", 0, "b");
			helper.insertText("C", 0, "a");
			helper.processAllOps();
			helper.obliterateRange("B", 0, 2);
			helper.removeRange("B", 4, 5);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "cde13");
			assert.equal(helper.clients.C.getText(), "cde13");

			helper.logger.validate();
		});

		it("does obliterate X for all clients", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "DE");
			helper.obliterateRange("B", 0, 1);
			helper.insertText("A", 0, "X");
			helper.insertText("B", 0, "ABC");
			helper.obliterateRange("B", 2, 4);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "AB");
			assert.equal(helper.clients.C.getText(), "AB");

			helper.logger.validate();
		});

		it("does not include remote but unacked segments in partial len calculation", () => {
			const helper = new ReconnectTestHelper();

			// 89-4567-123-X
			// 8-(9-4-w-567-1)-23-Y-X

			helper.insertText("A", 0, "X");
			helper.insertText("C", 0, "123");
			helper.insertText("C", 0, "4567");
			helper.insertText("B", 0, "89");
			helper.processAllOps();
			helper.obliterateRange("C", 1, 7);
			helper.insertText("A", 3, "w");
			helper.insertText("C", 3, "Y");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "823YX");
			assert.equal(helper.clients.B.getText(), "823YX");

			helper.logger.validate();
		});

		it("correctly accounts for overlapping obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "AB");
			helper.processAllOps();
			helper.obliterateRange("C", 0, 1);
			helper.obliterateRange("B", 0, 1);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "B");
			assert.equal(helper.clients.B.getText(), "B");
			assert.equal(helper.clients.C.getText(), "B");

			helper.logger.validate();
		});

		it("correctly accounts for overlapping obliterate and remove", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "AB");
			helper.processAllOps();
			helper.removeRange("C", 0, 1);
			helper.obliterateRange("B", 0, 1);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "B");
			assert.equal(helper.clients.B.getText(), "B");
			assert.equal(helper.clients.C.getText(), "B");

			helper.logger.validate();
		});

		it("clones movedClientIds array during insert", () => {
			const helper = new ReconnectTestHelper();

			// the bug found here:
			// the X was skipped over by client `A` because it had already been
			// deleted, so its length at refSeq was 0
			//
			// this was due to the movedClientIds array not being properly cloned
			// when marking obliterated during insert

			helper.insertText("C", 0, "ABCD");
			helper.processAllOps();
			helper.insertText("B", 2, "X");
			helper.obliterateRange("A", 1, 3);
			helper.obliterateRange("B", 1, 4);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "AD");
			assert.equal(helper.clients.B.getText(), "AD");
			assert.equal(helper.clients.C.getText(), "AD");

			helper.logger.validate();
		});

		it("client partial lens consider overlapping obliterates", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "123");
			helper.insertText("A", 0, "ABCDEF");
			helper.processAllOps();
			helper.obliterateRange("B", 2, 3);
			helper.obliterateRange("C", 1, 4);
			helper.obliterateRange("C", 4, 5);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "AEF13");
			assert.equal(helper.clients.B.getText(), "AEF13");
			assert.equal(helper.clients.C.getText(), "AEF13");

			helper.logger.validate();
		});

		it("client partial lens consider overlapping obliterates", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("C", 0, "X");
			helper.insertText("C", 0, "ABCDEFG");
			helper.processAllOps();
			helper.obliterateRange("B", 2, 3);
			helper.obliterateRange("C", 1, 4);
			helper.obliterateRange("C", 2, 3);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "AEGX");
			assert.equal(helper.clients.C.getText(), "AEGX");

			helper.logger.validate();
		});

		it("tracks obliterate refSeq when acking op for partial len calculation", () => {
			const helper = new ReconnectTestHelper();

			//   v-----------------------v
			//           v--v
			//                  v--v
			// 6-(345-AB-(CD)-E-(FG)-HI-1)-2

			helper.insertText("A", 0, "12");
			helper.insertText("B", 0, "ABCDEFGHI");
			helper.insertText("A", 0, "345");
			helper.obliterateRange("A", 0, 4);
			helper.obliterateRange("B", 2, 4);
			helper.insertText("A", 0, "6");
			helper.obliterateRange("B", 3, 5);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "62");
			assert.equal(helper.clients.B.getText(), "62");

			helper.logger.validate();
		});

		it("does not have negative len when segment obliterated before insert", () => {
			const helper = new ReconnectTestHelper();

			// 1234567-D-C-AB
			// 12-([3-X-45]-67)-D-C-AB

			helper.insertText("A", 0, "AB");
			helper.insertText("A", 0, "C");
			helper.insertText("A", 0, "D");
			helper.insertText("A", 0, "1234567");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 2, 7);
			helper.removeRange("A", 2, 5);
			helper.insertText("C", 3, "X");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "12B");
			assert.equal(helper.clients.B.getText(), "12B");
			assert.equal(helper.clients.C.getText(), "12B");

			helper.logger.validate();
		});

		it("does not have negative len when segment obliterated before insert", () => {
			const helper = new ReconnectTestHelper();

			// ABCDE-1-[2]-3
			// (A-XX-B)-(CD)-E-1-3

			helper.insertText("B", 0, "123");
			helper.insertText("C", 0, "ABCDE");
			helper.removeRange("B", 1, 2);
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("C", 0, 2);
			helper.obliterateRange("C", 0, 2);
			helper.insertText("B", 1, "XX");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "E13");
			assert.equal(helper.clients.B.getText(), "E13");
			assert.equal(helper.clients.C.getText(), "E13");

			helper.logger.validate();
		});

		it("deletes segments between two obliterates with different seq", () => {
			const helper = new ReconnectTestHelper();

			// 90-8-1234-(5)-67-D-C-B-A
			// 9-(EFG-[0-8-1234-(5)-67)]-D-C-B-A

			helper.insertText("A", 0, "A");
			helper.insertText("C", 0, "B");
			helper.insertText("C", 0, "C");
			helper.insertText("C", 0, "D");
			helper.insertText("B", 0, "1234567");
			helper.obliterateRange("B", 4, 5);
			helper.insertText("A", 0, "8");
			helper.insertText("A", 0, "90");
			helper.processAllOps();
			helper.removeRange("C", 1, 9);
			helper.insertText("A", 1, "EFG");
			helper.obliterateRange("A", 1, 11);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "9DCBA");

			helper.logger.validate();
		});

		it("deletes inserted segment when obliterate of different seq in-between", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "AB");
			helper.insertText("B", 0, "E");
			helper.obliterateRange("A", 0, 1);
			helper.insertText("A", 1, "12");
			helper.insertText("A", 0, "CD");
			helper.obliterateRange("A", 1, 4);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "C2");
			assert.equal(helper.clients.B.getText(), "C2");
			assert.equal(helper.clients.C.getText(), "C2");

			helper.logger.validate();
		});

		it("deletes inserted segment when obliterate of different seq in-between", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "ABC");
			helper.obliterateRange("A", 1, 2);
			helper.processAllOps();
			helper.insertText("A", 1, "D");
			helper.obliterateRange("C", 0, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("deletes inserted segment when obliterate of different seq in-between", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "ABC");
			helper.obliterateRange("A", 1, 2);
			helper.processAllOps();
			helper.insertText("A", 1, "D");
			helper.obliterateRange("C", 0, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("considers obliterated local segments as remotely obliterate", () => {
			const helper = new ReconnectTestHelper();

			// G-(H-F-I-C)-J-DE-A-(B)
			// G-J-(H-F-I-CD)-E

			helper.insertText("A", 0, "AB");
			helper.obliterateRange("A", 1, 2);
			helper.insertText("C", 0, "CDE");
			helper.insertText("B", 0, "F");
			helper.insertText("C", 0, "GH");
			helper.obliterateRange("C", 1, 3);
			helper.insertText("B", 1, "I");
			helper.insertText("C", 1, "J");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "GJDEA");
			assert.equal(helper.clients.B.getText(), "GJDEA");

			helper.logger.validate();
		});

		it("traverses hier block in obliterated when len at ref seq is >0 and len at len seq == 0", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "AB");
			helper.insertText("A", 2, "CD");
			helper.removeRange("A", 1, 3);
			helper.insertText("C", 0, "12345");
			helper.insertText("B", 0, "EFG");
			helper.insertText("B", 1, "HIJKL");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 6, 12);
			helper.removeRange("A", 5, 7);
			helper.obliterateRange("C", 7, 9);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), helper.clients.D.getText());
			assert.equal(helper.clients.B.getText(), "EHIJKAD");

			helper.logger.validate();
		});

		it("traverses hier block in obliterate when len at ref seq is >0 and len at len seq == 0", () => {
			const helper = new ReconnectTestHelper();

			// [E]-FGH-12-[A]-[B]-CD
			// 3-4-F-[G-(H-1)-2]-CD

			helper.insertText("B", 0, "ABCD");
			helper.removeRange("B", 0, 1);
			helper.insertText("C", 0, "12");
			helper.insertText("A", 0, "EFGH");
			helper.removeRange("B", 1, 2);
			helper.removeRange("A", 0, 1);
			helper.processAllOps();
			helper.logger.validate();
			helper.removeRange("A", 1, 5);
			helper.obliterateRange("B", 2, 4);
			helper.insertText("A", 0, "3");
			helper.insertText("A", 0, "4");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "43FBD");
			assert.equal(helper.clients.B.getText(), "43FBD");

			helper.logger.validate();
		});

		it("ignores segments where movedSeq < seq for partial len calculations", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "ABC");
			helper.insertText("A", 0, "DEF");
			helper.removeRange("A", 1, 2);
			helper.insertText("B", 0, "123456");
			helper.obliterateRange("B", 2, 7);
			helper.insertText("A", 1, "Y");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("B", 4, "X");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "12BCX");
			assert.equal(helper.clients.B.getText(), "12BCX");
			assert.equal(helper.clients.C.getText(), "12BCX");

			helper.logger.validate();
		});

		it("accounts for overlapping obliterates from same client", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "AB");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 0, 1);
			helper.obliterateRange("B", 0, 1);
			helper.removeRange("A", 0, 1);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("accounts for concurrently obliterated segments from the perspective of the inserting client for partial lengths", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("B", 0, "A");
			helper.insertText("C", 0, "B");
			helper.insertText("C", 0, "C");
			helper.insertText("A", 0, "1234");
			helper.processAllOps();
			helper.obliterateRange("C", 1, 3);
			helper.insertText("A", 2, "D");
			helper.insertText("A", 4, "E");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "1E4CBA");
			assert.equal(helper.clients.B.getText(), "1E4CBA");

			helper.logger.validate();
		});

		it("traverses segments when there is a local obliterate", () => {
			const helper = new ReconnectTestHelper();

			helper.insertText("A", 0, "AB");
			helper.obliterateRange("A", 0, 1);
			helper.insertText("C", 0, "12");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("C", 2, "C");
			helper.obliterateRange("A", 0, 3);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("keeps track of all obliterates on a segment", () => {
			const helper = new ReconnectTestHelper();

			// B-A
			// (B-C-(A))

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "B");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 1, 2);
			// bug here: because segment A has already been obliterated, we wouldn't
			// mark it obliterated by this op as well, meaning that segments in
			// this range would look to the right and not find a matching move seq
			helper.obliterateRange("A", 0, 2);
			helper.insertText("B", 1, "C");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");
			assert.equal(helper.clients.D.getText(), "");

			helper.logger.validate();
		});

		it("many overlapping obliterates", () => {
			const helper = new ReconnectTestHelper();

			// EF-ABCD
			// (1)-2-((E)-F-A)-B-(C)-D

			helper.insertText("C", 0, "ABCD");
			helper.insertText("B", 0, "EF");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 0, 3);
			helper.insertText("A", 0, "12");
			helper.removeRange("C", 0, 1);
			helper.obliterateRange("A", 0, 1);
			helper.obliterateRange("B", 1, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "2BD");

			helper.logger.validate();
		});

		it("overlapping obliterates at start", () => {
			const helper = new ReconnectTestHelper();

			// 12345-B-A
			// ((1-C-2)-3)-4-D-5-B-A

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "B");
			helper.insertText("A", 0, "12345");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 0, 2);
			helper.insertText("C", 1, "C");
			helper.obliterateRange("C", 0, 4);
			helper.insertText("C", 1, "D");
			helper.processAllOps();
			helper.logger.validate();
		});

		it("partial lengths updated when local insert is acked", () => {
			const helper = new ReconnectTestHelper();

			// A-BCDEF
			// (A-B-G-C)-D-I-E-H-F

			helper.insertText("A", 0, "A");
			helper.insertText("A", 1, "BCDEF");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("C", 0, 3);
			helper.insertText("A", 2, "G");
			helper.insertText("B", 5, "H");
			helper.insertText("C", 1, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "DIEHF");
			assert.equal(helper.clients.B.getText(), "DIEHF");
			assert.equal(helper.clients.C.getText(), "DIEHF");
			assert.equal(helper.clients.D.getText(), "DIEHF");

			helper.logger.validate();
		});

		it("two local obliterates get different seq numbers after ack", () => {
			const helper = new ReconnectTestHelper();

			// C-AB
			// (C-A)-D-(B)

			helper.insertText("C", 0, "AB");
			helper.insertText("A", 0, "C");
			helper.processAllOps();
			helper.logger.validate();
			// bug here: when the op is acked by client C, it would incorrectly give
			// segment B the same movedSeq despite coming from a different op
			helper.obliterateRange("C", 0, 2);
			helper.insertText("B", 2, "D");
			helper.obliterateRange("C", 0, 1);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "D");
			assert.equal(helper.clients.C.getText(), "D");

			helper.logger.validate();
		});

		it("acks remote segment obliterated by local op", () => {
			const helper = new ReconnectTestHelper();

			// (D-C-A)-B
			// (D-C-A)-B-E

			helper.insertText("B", 0, "AB");
			helper.insertText("A", 0, "C");
			helper.insertText("B", 0, "D");
			// bug here: when the op is acked by client B, it wouldn't correctly
			// visit the segment "C", leaving the obliterate unacked
			helper.obliterateRange("B", 0, 2);
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("C", 1, "E");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "BE");
			assert.equal(helper.clients.B.getText(), "BE");

			helper.logger.validate();
		});

		it("skips segments obliterated before refSeq when traversing for insertion", () => {
			const helper = new ReconnectTestHelper();

			// CDE-(A)-B
			// C-(DE-F-(A)-B)

			helper.insertText("A", 0, "AB");
			helper.obliterateRange("A", 0, 1);
			helper.insertText("A", 0, "CDE");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 1, 4);
			// bug here: when traversing to see if segment should be obliterated after
			// insertion, traversal would stop at segment A because it was obliterated
			// before the refSeq, which made it appear as an un-deleted segment
			helper.insertText("B", 3, "F");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "C");
			assert.equal(helper.clients.B.getText(), "C");
			assert.equal(helper.clients.C.getText(), "C");

			helper.logger.validate();
		});

		it("applies correct movedSeq when right segment has multiple movedSeqs", () => {
			const helper = new ReconnectTestHelper();

			// AB
			// (A-C-D-(B))

			helper.insertText("B", 0, "AB");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 1, 2);
			helper.obliterateRange("B", 0, 2);
			// bug here: for client B, segment B had multiple movedSeqs, and when
			// traversal went to the right and found a matching movedSeq in the movedSeqs
			// array, it selected the lowest seq in the array, which differed from
			// the correct and matching movedSeq
			helper.insertText("A", 1, "C");
			helper.insertText("A", 2, "D");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("takes the correct moved client id when multiple clientIds for right segment", () => {
			const helper = new ReconnectTestHelper();

			// AB
			// (A-C-D-(B))

			helper.insertText("A", 0, "AB");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 1, 2);
			// bug here: we would incorrectly take the client id of the first element
			// in the movedClientIds array because we did not take into account the
			// length of _both_ the local and non-local movedSeqs arrays
			helper.insertText("A", 1, "C");
			helper.obliterateRange("C", 0, 2);
			helper.insertText("A", 2, "D");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("selects clientId if 0", () => {
			const helper = new ReconnectTestHelper();

			// AB
			// (A-D-E-(C)-B)

			helper.insertText("B", 0, "AB");
			helper.processAllOps();
			helper.logger.validate();
			// bug here: client id was 0, and the check we used was !clientId, rather
			// than clientId !== undefined
			helper.insertText("A", 1, "C");
			helper.obliterateRange("B", 0, 2);
			helper.obliterateRange("A", 1, 2);
			helper.insertText("A", 1, "D");
			helper.insertText("A", 2, "E");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.B.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("obliterates unacked segment inside non-leaf-segment", () => {
			const helper = new ReconnectTestHelper();

			// FGHIJ-E-12345678-D-C-A-K-B
			// FGHIJ-E-12345-(6-[7-L-8-D]-C)-A-K-B

			helper.insertText("A", 0, "AB");
			helper.insertText("A", 0, "C");
			helper.insertText("C", 0, "D");
			helper.insertText("B", 0, "12345678");
			helper.insertText("B", 0, "E");
			helper.insertText("C", 0, "FGHIJ");
			helper.insertText("A", 2, "K");
			helper.processAllOps();
			helper.logger.validate();
			helper.removeRange("A", 12, 15);
			// bug here: when traversing for obliterate, we visit unacked segments
			// within the range, considering their length 0 but still marking them
			// obliterated. if the segment was inside a hiernode whose length was
			// also 0, we would incorrectly skip over the entire hier node, rather
			// than visiting the children segments
			helper.obliterateRange("A", 11, 13);
			helper.insertText("B", 13, "L");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "FGHIJE12345AKB");
			assert.equal(helper.clients.B.getText(), "FGHIJE12345AKB");
			assert.equal(helper.clients.C.getText(), "FGHIJE12345AKB");

			helper.logger.validate();
		});

		it("tracks length at seq of lower move/remove seq when overlapping", () => {
			const helper = new ReconnectTestHelper();

			// H-FG-A-CDE-B
			// (H-F-[G-A)-C-I-D]-E-B

			helper.insertText("C", 0, "AB");
			helper.insertText("C", 1, "CDE");
			helper.insertText("B", 0, "FG");
			helper.insertText("A", 0, "H");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 0, 4);
			helper.removeRange("B", 2, 6);
			// bug here: this insert triggers a new chunk to be created. when the
			// partial lengths of the new chunk were calculated, it incorrectly
			// used the removedSeq instead of the moveSeq, despite the latter having
			// occurred prior to the remove
			helper.insertText("A", 1, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "IEB");
			assert.equal(helper.clients.B.getText(), "IEB");
			assert.equal(helper.clients.C.getText(), "IEB");

			helper.logger.validate();
		});

		it("segment obliterated on insert overlaps with local obliterate", () => {
			const helper = new ReconnectTestHelper();

			// AB
			// ((A-C)-B)

			helper.insertText("B", 0, "AB");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("B", 1, "C");
			helper.obliterateRange("B", 0, 2);
			helper.obliterateRange("A", 0, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("obliterates entire string when concurrent inserts inside range", () => {
			const helper = new ReconnectTestHelper();

			// GT
			// (G-O-S-Y-T)

			helper.insertText("B", 0, "GT");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 0, 2);
			helper.insertText("C", 1, "OY");
			helper.insertText("C", 2, "S");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("obliterate ack traverses over non-obliterated remove", () => {
			const helper = new ReconnectTestHelper();

			// ABCDEFGH-1
			// ABCDE-(F-[G]-2-H)-1
			// ABCDE-(F-[G]-2-H)-1-3

			helper.insertText("A", 0, "1");
			helper.insertText("C", 0, "ABCDEFGH");
			helper.processAllOps();
			helper.logger.validate();
			helper.removeRange("C", 6, 7);
			helper.insertText("A", 7, "2");
			// obliterate at seq 5 isn't getting acked because it stops traversal
			// at the removed segment, which doesn't have move info
			helper.obliterateRange("C", 5, 7);
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("A", 6, "3");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "ABCDE13");
			assert.equal(helper.clients.C.getText(), "ABCDE13");

			helper.logger.validate();
		});

		it("overlapping remove and obliterate when remove happens last", () => {
			const helper = new ReconnectTestHelper();

			// FGH-E-D-BC-A
			// ([F]-G)-H-E-D-B-I-C-A

			helper.insertText("A", 0, "A");
			helper.insertText("B", 0, "BC");
			helper.insertText("C", 0, "D");
			helper.insertText("B", 0, "E");
			helper.insertText("B", 0, "FGH");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("C", 0, 2);
			helper.removeRange("A", 0, 1);
			helper.insertText("A", 5, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "HEDBICA");
			assert.equal(helper.clients.B.getText(), "HEDBICA");
			assert.equal(helper.clients.C.getText(), "HEDBICA");
			assert.equal(helper.clients.D.getText(), "HEDBICA");

			helper.logger.validate();
		});

		it("overlapping remove and obliterate when remove happens last _and_ partial length already exists", () => {
			const helper = new ReconnectTestHelper();

			// FGH-CDE-B-A
			// [F-(GH)-C]-D-Z-E-B-A

			helper.insertText("B", 0, "A");
			helper.insertText("B", 0, "B");
			helper.insertText("B", 0, "CDE");
			helper.insertText("C", 0, "FGH");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("C", 1, 2);
			helper.removeRange("A", 0, 4);
			helper.insertText("A", 1, "Z");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "DZEBA");

			helper.logger.validate();
		});

		it("overlapping obliterate and remove when obliterate is larger than remove and happened last", () => {
			const helper = new ReconnectTestHelper();

			// H-CDEFG-B-A
			// (H-C-[D]-E)-F-Z-G-B-A

			helper.insertText("B", 0, "A");
			helper.insertText("C", 0, "B");
			helper.insertText("A", 0, "CDEFG");
			helper.insertText("A", 0, "H");
			helper.processAllOps();
			helper.logger.validate();
			helper.removeRange("A", 2, 3);
			helper.obliterateRange("C", 0, 4);
			helper.insertText("C", 1, "Z");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "FZGBA");

			helper.logger.validate();
		});

		it("wasMovedOnInsert remains after leaf node is split", () => {
			const helper = new ReconnectTestHelper();

			// CD-B-A
			// I-(C-(G)H-E)-F-D-B-A

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "B");
			helper.insertText("B", 0, "CD");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("B", 1, "EF");
			helper.obliterateRange("B", 0, 2);
			helper.insertText("A", 1, "GH");
			helper.obliterateRange("A", 1, 2);
			helper.insertText("B", 0, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "IFDBA");

			helper.logger.validate();
		});

		it("overlapping obliterates, segment is obliterated on insert and by local client", () => {
			const helper = new ReconnectTestHelper();

			// DEFG-BC-A
			// v-----------v
			//    v-----v
			// (D-(E-H-F)-G)-B-I-C-A

			helper.insertText("B", 0, "A");
			helper.insertText("C", 0, "BC");
			helper.insertText("B", 0, "DEFG");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 1, 3);
			helper.insertText("A", 2, "H");
			helper.obliterateRange("A", 0, 5);
			helper.insertText("A", 1, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "BICA");

			helper.logger.validate();
		});

		it("overlapping obliterates and remove", () => {
			const helper = new ReconnectTestHelper();

			// FGHIJKL-BCDE-A
			// (FGHI-[JK-(L-B)-C]-D)-E-M-A

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "BCDE");
			helper.insertText("A", 0, "FGHIJKL");
			helper.processAllOps();
			helper.logger.validate();
			helper.removeRange("B", 4, 9);
			helper.obliterateRange("A", 6, 8);
			helper.obliterateRange("C", 0, 10);
			helper.insertText("C", 1, "M");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "EMA");

			helper.logger.validate();
		});

		it("does not mark obliterated on insert for non-acked obliterates", () => {
			const helper = new ReconnectTestHelper();

			// CDE-B-A
			// I-((C-F)-G-D)-H-E-B-A

			helper.insertText("B", 0, "A");
			helper.insertText("A", 0, "B");
			helper.insertText("C", 0, "CDE");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("A", 1, "FG");
			helper.obliterateRange("A", 0, 2);
			helper.insertText("A", 2, "H");
			helper.obliterateRange("C", 0, 2);
			helper.insertText("C", 0, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "IHEBA");

			helper.logger.validate();
		});

		it("partial len isLocal when seq is -1 but moveSeq > -1", () => {
			const helper = new ReconnectTestHelper();

			// CDEFG-AB
			// C-((D-I-E)-F)-G-A-H-B

			helper.insertText("A", 0, "AB");
			helper.insertText("B", 0, "CDEFG");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("C", 1, 4);
			helper.obliterateRange("B", 1, 3);
			helper.insertText("B", 4, "H");
			helper.insertText("A", 2, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "CGAHB");

			helper.logger.validate();
		});

		it("obliterated on insert by overlapping obliterates", () => {
			const helper = new ReconnectTestHelper();

			// B-DEFG-C-A
			// ((B-D-H-E)-F-I-G-C)-A

			helper.insertText("C", 0, "A");
			helper.insertText("A", 0, "BC");
			helper.insertText("A", 1, "DEFG");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 0, 6);
			helper.obliterateRange("A", 0, 3);
			helper.insertText("C", 2, "H");
			helper.insertText("A", 1, "I");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "A");

			helper.logger.validate();
		});

		it("overlapping obliterates", () => {
			const helper = new ReconnectTestHelper();

			// ABCDEF
			//   v-------------v
			//        v-----------v
			//    v-------v
			// I-((AB-(C-G)-H-D)-E)-F

			helper.insertText("A", 0, "ABCDEF");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 0, 4);
			helper.obliterateRange("C", 2, 5);
			helper.insertText("A", 3, "GH");
			helper.insertText("C", 0, "I");
			helper.obliterateRange("A", 0, 4);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "IF");

			helper.logger.validate();
		});

		it("overlapping obliterates", () => {
			const helper = new ReconnectTestHelper();

			// CDEF-AB
			// v-------------------v
			//  v---------v
			//     v-v
			// ((C-(G)-H-D)-E-I-F-A)-B

			helper.insertText("B", 0, "AB");
			helper.insertText("C", 0, "CDEF");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 0, 5);
			helper.obliterateRange("C", 0, 2);
			helper.insertText("A", 1, "GH");
			helper.insertText("C", 1, "I");
			helper.obliterateRange("A", 1, 2);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "B");

			helper.logger.validate();
		});

		it("overlapping remove and obliterate, local obliterate does not have a remote obliterated len", () => {
			const helper = new ReconnectTestHelper();

			//      v-v------v-v
			// G-(H-[F]-E)-D-[A]-B-I-C

			helper.insertText("A", 0, "ABC");
			helper.insertText("B", 0, "D");
			helper.insertText("B", 0, "E");
			helper.insertText("A", 0, "F");
			helper.removeRange("A", 0, 2);
			helper.insertText("B", 0, "GH");
			helper.insertText("A", 1, "I");
			helper.obliterateRange("B", 1, 3);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "GDBIC");

			helper.logger.validate();
		});

		it("triple overlapping obliterate and overlapping remove", () => {
			const helper = new ReconnectTestHelper();

			// I-H-BCDEFG-A
			//            v------------v
			//               v-------v
			//                  v-v
			// v-------------------------v
			// [[I]-H-BCD-(E-(F-(J)-G))-A]

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "BCDEFG");
			helper.insertText("B", 0, "H");
			helper.insertText("B", 0, "I");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 6, 8);
			helper.obliterateRange("A", 5, 8);
			helper.removeRange("C", 0, 1);
			helper.insertText("C", 6, "J");
			helper.obliterateRange("C", 6, 7);
			helper.removeRange("A", 0, 6);
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "");
			assert.equal(helper.clients.C.getText(), "");

			helper.logger.validate();
		});

		it("triple overlapping obliterate with one being local", () => {
			const helper = new ReconnectTestHelper();

			// CDEFG-B-A
			//   v--------v
			//       v--------v
			//        v------v
			// J-(CD-((E-H)-F))-I-G-B-A

			helper.insertText("C", 0, "A");
			helper.insertText("B", 0, "B");
			helper.insertText("C", 0, "CDEFG");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 2, 4);
			helper.insertText("C", 3, "H");
			helper.obliterateRange("C", 0, 4);
			helper.insertText("C", 1, "I");
			helper.insertText("B", 0, "J");
			helper.obliterateRange("B", 3, 5);
			helper.processAllOps();

			assert.equal(helper.clients.C.getText(), "JIGBA");

			helper.logger.validate();
		});

		it("obliterate ack traversal is not stopped by moved segment", () => {
			const helper = new ReconnectTestHelper();

			// ABCD
			// (A-(B)-E-C)-D-F

			helper.insertText("B", 0, "ABCD");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("A", 1, 2);
			helper.insertText("C", 2, "E");
			helper.obliterateRange("A", 0, 2);
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("C", 1, "F");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "DF");
			assert.equal(helper.clients.C.getText(), "DF");

			helper.logger.validate();
		});

		it("updates partial lengths for segments when doing obliterate ack traversal", () => {
			const helper = new ReconnectTestHelper();

			// O-JKLMN-FGHI-E-CD-AB
			//               v-v---v-----v
			// (P-O-JKLMN-FG-[H]-Q-[I-E-C]-D-A)-B
			// (P-O-JKLMN-FG-[H]-Q-[I-E-C]-D-A)-B-R

			// problematic segment: H-Q-I-E

			helper.insertText("B", 0, "AB");
			helper.insertText("A", 0, "CD");
			helper.insertText("A", 0, "E");
			helper.insertText("A", 0, "FGHI");
			helper.insertText("C", 0, "JKLMN");
			helper.insertText("B", 0, "O");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("A", 0, "P");
			helper.insertText("B", 9, "Q");
			helper.removeRange("A", 9, 13);
			helper.obliterateRange("A", 0, 11);
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("B", 1, "R");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "BR");

			helper.logger.validate();
		});

		// fails only for incremental
		it("combines remote obliterated length ", () => {
			const helper = new ReconnectTestHelper();

			// R-XYZ12-STUVW-LMNOP-DEFGHIJK-A-34567890-Q-BC
			// v---------------v------------v------v--------v------------v
			// [R-XYZ12-STUVW-L]-abcdefghij-[MNOP-D]-klmnop-[EFGHIJK-A-34]-5-(6-x-7)-890-Q-BC

			//                                  v--------v
			//                                         v--------v
			// a-T-b-S-c-[def]-ghij-k-Q-l-R-mno-[p-5-8-[9]-0-Q-B]-C

			//                  v--------v
			//                         v--------v
			// segment is R-mno-[p-5-8-[9]-0-Q-B]-C
			//       v-------------------------------v
			//                                     v--------v
			//          v------------v
			// R-mno-[p-[EFGHIJK-A-34]-5-(6-x-7)-8-[9]-0-Q-B]-C

			helper.insertText("A", 0, "ABC");
			helper.insertText("C", 0, "DEFGHIJK");
			helper.insertText("C", 0, "LMNOP");
			helper.insertText("A", 1, "Q");
			helper.insertText("B", 0, "RSTUVW");
			helper.insertText("B", 1, "XYZ12");
			helper.insertText("A", 1, "34567890");
			helper.processAllOps();
			helper.logger.validate();
			helper.insertText("C", 29, "x");
			helper.removeRange("B", 0, 27);
			helper.insertText("A", 12, "abcdefghij");
			helper.obliterateRange("A", 38, 40);
			helper.insertText("C", 17, "klmnop");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "abcdefghijklmnop5890QBC");

			helper.logger.validate();
			helper.removeRange("B", 3, 6);
			helper.insertText("C", 11, "Q");
			helper.insertText("B", 9, "R");
			helper.insertText("B", 2, "S");
			helper.removeRange("C", 19, 23);
			helper.obliterateRange("B", 14, 18);
			helper.insertText("B", 1, "T");
			helper.processAllOps();

			assert.equal(helper.clients.A.getText(), "aTbScghijkQlRmnoC");

			helper.logger.validate();
		});

		it("three obliterates on same segment", () => {
			const helper = new ReconnectTestHelper();

			// A
			// (C-B-D-((A)))

			helper.insertText("B", 0, "A");
			helper.processAllOps();
			helper.logger.validate();
			helper.obliterateRange("B", 0, 1);
			helper.obliterateRange("A", 0, 1);
			helper.insertText("A", 0, "B");
			helper.insertText("C", 0, "C");
			helper.insertText("A", 1, "D");
			helper.obliterateRange("C", 0, 2);
			helper.processAllOps();
			helper.logger.validate();
		});

		describe("incremental partial length updates", () => {
			it("obliterates concurrently inserted segment", () => {
				const helper = new ReconnectTestHelper();

				// (C-B-A)

				helper.insertText("A", 0, "A");
				helper.insertText("B", 0, "B");
				helper.insertText("A", 0, "C");
				helper.obliterateRange("A", 0, 2);
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "");

				helper.logger.validate();
			});

			it("obliterates 2 concurrently inserted segments", () => {
				const helper = new ReconnectTestHelper();

				// (C-B-D-A)

				helper.insertText("B", 0, "A");
				helper.insertText("A", 0, "B");
				helper.insertText("B", 0, "C");
				helper.obliterateRange("B", 0, 2);
				helper.insertText("A", 1, "D");
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "");

				helper.logger.validate();
			});

			it("obliterates 4 concurrently inserted segments", () => {
				const helper = new ReconnectTestHelper();

				// I-F-(G-D-H-E-C-A)-B

				helper.insertText("B", 0, "AB");
				helper.insertText("B", 0, "C");
				helper.insertText("A", 0, "DE");
				helper.insertText("B", 0, "FG");
				helper.obliterateRange("B", 1, 4);
				helper.insertText("A", 1, "H");
				helper.insertText("B", 0, "I");
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "IFB");

				helper.logger.validate();
			});

			it("obliterates 3 concurrently inserted segments", () => {
				const helper = new ReconnectTestHelper();

				// I-G-(H-D-F-E-B)-C-A

				helper.insertText("B", 0, "A");
				helper.insertText("B", 0, "BC");
				helper.insertText("A", 0, "DE");
				helper.insertText("A", 1, "F");
				helper.insertText("B", 0, "GH");
				helper.obliterateRange("B", 1, 3);
				helper.insertText("B", 0, "I");
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "IGCA");

				helper.logger.validate();
			});

			it("overlapping remove + obliterate, remove happened first", () => {
				const helper = new ReconnectTestHelper();

				// D-EFG-B-H-C-A
				// I-D-([E]-F)-G-B-H-C-A

				helper.insertText("A", 0, "A");
				helper.insertText("B", 0, "BC");
				helper.insertText("C", 0, "DEFG");
				helper.insertText("B", 1, "H");
				helper.processAllOps();
				helper.logger.validate();
				helper.removeRange("B", 1, 2);
				helper.obliterateRange("A", 1, 3);
				helper.insertText("A", 0, "I");
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "IDGBHCA");

				helper.logger.validate();
			});

			it("overlapping remove + obliterate, remove happened last", () => {
				const helper = new ReconnectTestHelper();

				// DEFGH-C-B-A
				// [D]-[E-(F)-G]-H-C-B-A

				helper.insertText("C", 0, "A");
				helper.insertText("B", 0, "B");
				helper.insertText("A", 0, "C");
				helper.insertText("B", 0, "DEFGH");
				helper.processAllOps();
				helper.logger.validate();
				helper.obliterateRange("C", 2, 3);
				helper.removeRange("A", 1, 4);
				helper.removeRange("A", 0, 1);
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "HCBA");

				helper.logger.validate();
			});

			it("segment inside locally obliterated segment group is split", () => {
				const helper = new ReconnectTestHelper();

				// CDEF-AB
				// [C]-DE-(F-(G)-H-A)-B
				// [C]-DE-(F-(G)-H-A)-(B)

				helper.insertText("B", 0, "AB");
				helper.insertText("B", 0, "CDEF");
				helper.processAllOps();
				helper.logger.validate();
				helper.removeRange("C", 0, 1);
				helper.insertText("C", 3, "GH");
				helper.obliterateRange("C", 3, 4);
				helper.obliterateRange("A", 3, 5);
				helper.processAllOps();
				helper.logger.validate();
				helper.obliterateRange("B", 2, 3);
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "DE");

				helper.logger.validate();
			});

			it("continues traversal past locally removed segment inserted before first obliterate", () => {
				const helper = new ReconnectTestHelper();

				// ABC
				// (E-D-(A)-[B]-C)

				helper.insertText("A", 0, "ABC");
				helper.processAllOps();
				helper.logger.validate();
				helper.obliterateRange("C", 0, 1);
				helper.insertText("B", 0, "D");
				helper.removeRange("C", 0, 1);
				helper.insertText("C", 0, "E");
				helper.obliterateRange("C", 0, 2);
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "");

				helper.logger.validate();
			});

			it("keeps track of remote obliterated length when hier node contains hier nodes", () => {
				const helper = new ReconnectTestHelper();

				// LMNO-HIJ-E-K-FG-D-C-AB
				// lmnopq-L-[M]-NO-H-ghijk-I-(J-E-K-FG-D-C-A-a)-bc-ef-d-B
				//                                  v--------------------------------------v
				//          v-------------------v
				// r-l-x-mn-[opq-L-[M]-NO-H-gh-s]-t-(u-i-[j]-k-I-(J-E-K-FG-D-C-A-a)-b-v-c-e)-f-d-B

				// bad segment: (I-(J-E-K-FG-D-C-A-a)-b-v-c-e)-f-d-B

				helper.insertText("B", 0, "AB");
				helper.insertText("C", 0, "C");
				helper.insertText("A", 0, "D");
				helper.insertText("B", 0, "EFG");
				helper.insertText("C", 0, "HIJ");
				helper.insertText("B", 1, "K");
				helper.insertText("B", 0, "LMNO");
				helper.processAllOps();
				helper.logger.validate();
				helper.removeRange("A", 1, 2);
				helper.insertText("A", 13, "abcd");
				helper.obliterateRange("A", 5, 14);
				helper.insertText("A", 7, "ef"); // seq: 11, len: 7
				helper.insertText("B", 5, "ghijk");
				helper.insertText("C", 0, "lmnopq"); // seq: 13, len: 7
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "lmnopqLNOHghijkIbcefdB");

				helper.logger.validate();
				helper.insertText("A", 0, "r");
				helper.insertText("B", 12, "stu");
				helper.insertText("A", 18, "v"); // seq: 16, len: 8
				helper.obliterateRange("B", 14, 22); // seq: 17, len: 3
				helper.removeRange("B", 3, 13); // seq: 18, len: 3
				helper.removeRange("A", 14, 15); // seq: 19, len: 3
				helper.insertText("B", 1, "x");
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "rlxmntfdB");

				helper.logger.validate();
			});

			it("combines remote obliterated length for parent node of tree with depth >=3", () => {
				const helper = new ReconnectTestHelper();

				// VWXYZ0-(K)-[L]-M-[N]-O-EFGHIJ-[A]-B-P-TU-QRS-CD
				//                                      v-v------v------------v
				//                                            v--------------------v
				//       v----v---------v-v-----v-----v------------------------------v-v
				// V-c-W-[XYZ0]-(K)-[L]-[M]-[N]-[O-EFG]-[H]-a-[b-[IJ-[A]-B-P-T]-U-Q]-[R]-S-C-d-f-e-D

				//                                                  v-v------v-v---v-----------v
				//                                                        v-------------------------v
				//            v------v---------v-v-----v---v---v--v-----------------------------------v-v
				//     v---------v
				// j-i-(V-c-W-[XY)-Z0]-(K)-[L]-[M]-[N]-[O-E]-h-[FG]-[H]-a-[b-[I]-g-[J-[A]-B-P-T]-U-Q]-[R]-S-C-d-f-e-D

				// problem segment: j-i-(V-c-W-[XY)-Z0]-(K)-[L]-[M]-[N]-[O-E]-h-[FG]-[H]-a-[b]
				// specifically: j-(V-c-W

				helper.insertText("C", 0, "ABCD");
				helper.removeRange("C", 0, 1);
				helper.insertText("B", 0, "EFGHIJ");
				helper.insertText("A", 0, "KLMNO");
				helper.obliterateRange("A", 0, 1);
				helper.removeRange("A", 0, 1);
				helper.insertText("C", 1, "PQRS");
				helper.insertText("C", 2, "TU");
				helper.removeRange("A", 1, 2);
				helper.insertText("A", 0, "VWXYZ0"); // seq: 10, len: 2
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "VWXYZ0MOEFGHIJBPTUQRSCD");

				helper.logger.validate();
				helper.insertText("C", 12, "ab");
				helper.removeRange("B", 11, 17);
				helper.removeRange("C", 13, 21);
				helper.insertText("B", 1, "c"); // seq: 14, len: 3
				helper.insertText("C", 16, "de");
				helper.insertText("C", 17, "f");
				helper.removeRange("B", 3, 15);
				helper.insertText("A", 13, "g");
				helper.insertText("A", 9, "h");
				helper.obliterateRange("C", 0, 4); // seq: 20, len: 0
				helper.insertText("C", 0, "i");
				helper.insertText("A", 0, "j"); // seq: 22, len: 1
				helper.processAllOps();

				assert.equal(helper.clients.A.getText(), "jihagSCdfeD");

				helper.logger.validate();
			});
		});
	});
}
