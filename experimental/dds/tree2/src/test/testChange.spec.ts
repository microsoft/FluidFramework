/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { cursorForJsonableTreeNode } from "../feature-libraries";
import { makeAnonChange, FieldKey, tagChange, mintRevisionTag, deltaForSet } from "../core";
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
		const tag = mintRevisionTag();
		const delta = TestChange.toDelta(tagChange(change1, tag));
		const fooField: FieldKey = brand("foo");
		const expected = new Map([
			[
				fooField,
				deltaForSet(
					cursorForJsonableTreeNode({
						type: brand("test"),
						value: "2|3",
					}),
					{ major: tag, minor: 424243 },
					{ major: tag, minor: 424242 },
				),
			],
		]);

		assert.deepEqual(delta, expected);
		assert.deepEqual(
			TestChange.toDelta(makeAnonChange(TestChange.mint([0, 1], []))),
			new Map(),
		);
	});

	it("can be encoded in JSON", () => {
		const codec = TestChange.codec;
		const empty = TestChange.emptyChange;
		const normal = TestChange.mint([0, 1], [2, 3]);
		assert.deepEqual(empty, codec.decode(codec.encode(empty)));
		assert.deepEqual(normal, codec.decode(codec.encode(normal)));
	});
});
