/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../feature-libraries";
import { leaf } from "../../../domains";
import { createTreeView, pretty } from "./utils";

const _ = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });
const schema = _.toDocumentSchema(_.optional(leaf.all));

const testCases = [
	undefined,

	// TODO: null,

	true,
	false,

	-Infinity,
	-Number.MAX_VALUE,
	-Number.MIN_SAFE_INTEGER,
	-0,
	NaN,
	0,
	Number.MAX_SAFE_INTEGER,
	Number.MAX_VALUE,
	Infinity,

	"", // empty string
	"!~", // printable ascii range
	"比特币", // non-ascii range
	"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
];

describe("Primitives", () => {
	describe("satisfy 'deepEquals'", () => {
		for (const testCase of testCases) {
			const view = createTreeView(schema, testCase);
			const real = testCase;
			const proxy = view.root2(schema);

			it(`deepEquals(${pretty(proxy)}, ${pretty(real)})`, () => {
				assert.deepEqual(proxy, real, "Proxy must satisfy 'deepEquals'.");
			});
		}
	});
});
