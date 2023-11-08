/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { leaf, SchemaBuilder } from "../../../domains";
import { createTreeView2, pretty } from "./utils";

const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
const schema = _.intoSchema(_.optional(leaf.all));

const testCases = [
	undefined, // via optional root

	// TODO: null,

	true,
	false,

	-Infinity,
	-Number.MAX_VALUE,
	Number.MIN_SAFE_INTEGER,
	-Number.MIN_VALUE,
	-0,
	NaN,
	0,
	Number.MIN_VALUE,
	Number.MAX_SAFE_INTEGER,
	Number.MAX_VALUE,
	Infinity,

	"", // empty string
	"!~", // printable ascii range
	"比特币", // non-ascii range
	"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
];

// Construct a SharedTree with each of the above primitives as the root and then
// 'deepEquals' compares the proxy with the original primitive value.
//
// Also covers the corner case of an empty tree (via optional root) by constructing
// a tree with an 'undefined' root.
describe("Primitives", () => {
	describe("satisfy 'deepEquals'", () => {
		for (const testCase of testCases) {
			const view = createTreeView2(schema, testCase);
			const real = testCase;
			const proxy = view.root;

			it(`deepEquals(${pretty(proxy)}, ${pretty(real)})`, () => {
				assert.deepEqual(proxy, real, "Proxy must satisfy 'deepEquals'.");
			});
		}
	});
});
