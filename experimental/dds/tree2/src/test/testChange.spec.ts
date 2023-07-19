/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { singleTextCursor } from "../feature-libraries";
import { makeAnonChange, Delta, FieldKey } from "../core";
import { brand } from "../util";
import { TestChange } from "./testChange";

describe("TestChange", () => {
	it("can be composed", () => {
		const change1 = TestChange.mint([0, 1], 2);
		const change2 = TestChange.mint([0, 1, 2], 3);
		const composed = TestChange.compose([makeAnonChange(change1), makeAnonChange(change2)]);

		const expected = TestChange.mint([0, 1], [2, 3]);
		assert.deepEqual(composed, expected);
	});

	it("can be composed without verification", () => {
		const change1 = TestChange.mint([0], 1);
		const change2 = TestChange.mint([2], 3);
		const composed = TestChange.compose(
			[makeAnonChange(change1), makeAnonChange(change2)],
			false,
		);

		const expected = TestChange.mint([0], [1, 3]);
		assert.deepEqual(composed, expected);
	});

	it("composition of inverses leads to normalized form", () => {
		const change1 = TestChange.mint([0], [1, 2]);
		const change2 = TestChange.mint([0, 1, 2], [-2, -1, 3]);
		const composed = TestChange.compose([makeAnonChange(change1), makeAnonChange(change2)]);

		const expected = TestChange.mint([0], [3]);
		assert.deepEqual(composed, expected);
	});

	it("can be inverted", () => {
		const change1 = TestChange.mint([0, 1], 2);
		const inverted = TestChange.invert(change1);

		const expected = TestChange.mint([0, 1, 2], -2);
		assert.deepEqual(inverted, expected);
	});

	it("can be rebased", () => {
		const change1 = TestChange.mint([0], 1);
		const change2 = TestChange.mint([0], 2);
		const rebased = TestChange.rebase(change2, change1);

		const expected = TestChange.mint([0, 1], 2);
		assert.deepEqual(rebased, expected);
	});

	it("can be represented as a delta", () => {
		const change1 = TestChange.mint([0, 1], [2, 3]);
		const delta = TestChange.toDelta(change1);
		const fooField: FieldKey = brand("foo");
		const expected = {
			type: Delta.MarkType.Modify,
			fields: new Map([
				[
					fooField,
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{
							type: Delta.MarkType.Insert,
							content: [
								singleTextCursor({
									type: brand("test"),
									value: "2|3",
								}),
							],
						},
					],
				],
			]),
		};

		assert.deepEqual(delta, expected);
		assert.deepEqual(TestChange.toDelta(TestChange.mint([0, 1], [])), {
			type: Delta.MarkType.Modify,
		});
	});

	it("can be encoded in JSON", () => {
		const codec = TestChange.codec;
		const empty = TestChange.emptyChange;
		const normal = TestChange.mint([0, 1], [2, 3]);
		assert.deepEqual(empty, codec.decode(codec.encode(empty)));
		assert.deepEqual(normal, codec.decode(codec.encode(normal)));
	});
});
