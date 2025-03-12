/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { opstampUtils, type OperationStamp } from "../mergeTreeNodes.js";
import { UnassignedSequenceNumber } from "../constants.js";

describe("opstampUtils", () => {
	describe("insertIntoList", () => {
		const ts1: OperationStamp = { clientId: 1, seq: 1 };
		const ts2: OperationStamp = { clientId: 2, seq: 2 };
		const ts3: OperationStamp = { clientId: 1, seq: 3 };
		const tsLocal1: OperationStamp = {
			clientId: 1,
			seq: UnassignedSequenceNumber,
			localSeq: 1,
		};
		const tsLocal2: OperationStamp = {
			clientId: 1,
			seq: UnassignedSequenceNumber,
			localSeq: 2,
		};

		it("inserts unacked into empty list", () => {
			const list: OperationStamp[] = [];
			opstampUtils.insertIntoList(list, tsLocal1);
			assert.deepStrictEqual(list, [tsLocal1]);
		});

		it("inserts acked into empty list", () => {
			const list: OperationStamp[] = [];
			opstampUtils.insertIntoList(list, ts1);
			assert.deepStrictEqual(list, [ts1]);
		});

		it("inserts unacked after acked", () => {
			const list: OperationStamp[] = [ts1];
			opstampUtils.insertIntoList(list, tsLocal1);
			assert.deepStrictEqual(list, [ts1, tsLocal1]);
		});

		it("inserts acked before unacked", () => {
			const list: OperationStamp[] = [ts1, ts2, tsLocal1];
			opstampUtils.insertIntoList(list, ts3);
			assert.deepStrictEqual(list, [ts1, ts2, ts3, tsLocal1]);
		});

		it("inserts acked before single unacked", () => {
			const list: OperationStamp[] = [tsLocal1];
			opstampUtils.insertIntoList(list, ts2);
			assert.deepStrictEqual(list, [ts2, tsLocal1]);
		});

		it("inserts local seqs at end", () => {
			const list: OperationStamp[] = [ts1, ts2];
			opstampUtils.insertIntoList(list, tsLocal1);
			opstampUtils.insertIntoList(list, tsLocal2);
			assert.deepStrictEqual(list, [ts1, ts2, tsLocal1, tsLocal2]);
		});
	});
});
