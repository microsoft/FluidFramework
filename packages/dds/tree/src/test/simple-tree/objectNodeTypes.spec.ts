/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { ObjectNodeSchema } from "../../simple-tree/objectNodeTypes.js";
import { SchemaFactory, type TreeNodeSchema } from "../../simple-tree/index.js";

const schemaFactory = new SchemaFactory("Test");

describe("ObjectNodeTypes", () => {
	describe("ObjectNodeSchema", () => {
		it("instanceof", () => {
			class ObjectSchema extends schemaFactory.object("x", {}) {}
			class ArraySchema extends schemaFactory.array("A", schemaFactory.number) {}

			const schema: TreeNodeSchema = ObjectSchema;
			// Narrow type
			assert(schema instanceof ObjectNodeSchema);
			// Allows access to "fields" map.
			assert.equal(schema.fields.size, 0);

			assert(!(ArraySchema instanceof ObjectNodeSchema));
		});
	});
});
