/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { singleJsonCursor } from "../../json/index.js";
// eslint-disable-next-line import/no-internal-modules
import { conciseFromCursor } from "../../../simple-tree/api/conciseTree.js";
import { JsonUnion } from "../../../jsonDomainSchema.js";

describe("simple-tree conciseTree", () => {
	it("conciseFromCursor", () => {
		assert.deepEqual(
			conciseFromCursor(singleJsonCursor({ a: { b: 1 } }), JsonUnion, {
				valueConverter: () => fail(),
			}),
			{
				a: { b: 1 },
			},
		);
	});
});
