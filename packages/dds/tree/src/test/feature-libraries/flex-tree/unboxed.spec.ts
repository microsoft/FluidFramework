/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import { unboxedFlexNode } from "../../../feature-libraries/flex-tree/unboxed.js";
import { isFlexTreeNode } from "../../../feature-libraries/index.js";

import { readonlyTreeWithContent } from "./utils.js";
import { stringSchema } from "../../../simple-tree/leafNodeSchema.js";
import { JsonUnion, singleJsonCursor } from "../../json/index.js";

describe("unboxedFlexNode", () => {
	it("Leaf", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema: stringSchema,
			initialTree: singleJsonCursor("Hello world"),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedFlexNode(context, cursor), "Hello world");
	});

	it("Non-Leaf", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema: JsonUnion,
			initialTree: singleJsonCursor({}),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert(isFlexTreeNode(unboxedFlexNode(context, cursor)));
	});
});
