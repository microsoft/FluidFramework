/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { timestampUtils, type OperationTimestamp } from "../mergeTreeNodes.js";
import { UnassignedSequenceNumber } from "../constants.js";

describe("timestampUtils", () => {
	describe("insertIntoList", () => {
		const ts1: OperationTimestamp = { clientId: 1, seq: 1 };
		const ts2: OperationTimestamp = { clientId: 2, seq: 2 };
		const ts3: OperationTimestamp = { clientId: 1, seq: 3 };
		const tsLocal1: OperationTimestamp = {
			clientId: 1,
			seq: UnassignedSequenceNumber,
			localSeq: 1,
		};
		const tsLocal2: OperationTimestamp = {
			clientId: 1,
			seq: UnassignedSequenceNumber,
			localSeq: 2,
		};

		it("inserts unacked into empty list", () => {
			const list: OperationTimestamp[] = [];
			timestampUtils.insertIntoList(list, tsLocal1);
			assert.deepStrictEqual(list, [tsLocal1]);
		});

		it("inserts acked into empty list", () => {
			const list: OperationTimestamp[] = [];
			timestampUtils.insertIntoList(list, ts1);
			assert.deepStrictEqual(list, [ts1]);
		});

		it("inserts unacked after acked", () => {
			const list: OperationTimestamp[] = [ts1];
			timestampUtils.insertIntoList(list, tsLocal1);
			assert.deepStrictEqual(list, [ts1, tsLocal1]);
		});

		it("inserts acked before unacked", () => {
			const list: OperationTimestamp[] = [ts1, ts2, tsLocal1];
			timestampUtils.insertIntoList(list, ts3);
			assert.deepStrictEqual(list, [ts1, ts2, ts3, tsLocal1]);
		});

		it("inserts acked before single unacked", () => {
			const list: OperationTimestamp[] = [tsLocal1];
			timestampUtils.insertIntoList(list, ts2);
			assert.deepStrictEqual(list, [ts2, tsLocal1]);
		});

		it("inserts local seqs at end", () => {
			const list: OperationTimestamp[] = [ts1, ts2];
			timestampUtils.insertIntoList(list, tsLocal1);
			timestampUtils.insertIntoList(list, tsLocal2);
			assert.deepStrictEqual(list, [ts1, ts2, tsLocal1, tsLocal2]);
		});
	});
});
