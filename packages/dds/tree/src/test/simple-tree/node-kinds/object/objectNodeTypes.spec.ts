/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	ObjectNodeSchema,
	SchemaFactory,
	isObjectNodeSchema,
} from "../../../../simple-tree/index.js";

const schemaFactory = new SchemaFactory("Test");

describe("objectNodeTypes", () => {
	it("isObjectNodeSchema", () => {
		class A extends schemaFactory.object("A", {}) {}
		class B extends schemaFactory.array("B", []) {}

		assert(isObjectNodeSchema(A));
		assert(!isObjectNodeSchema(B));

		assert(A instanceof ObjectNodeSchema);
		assert(B instanceof ObjectNodeSchema === false);
	});
});
