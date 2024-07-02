/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
	toJsonSchema,
	type SimpleNodeSchema,
	type SimpleTreeSchema,
	type TreeJsonSchema,
} from "../../simple-tree/index.js";

describe("JsonSchema", () => {
	describe("toJsonSchema", () => {
		it("Leaf schema", () => {
			const input: SimpleTreeSchema = {
				definitions: new Map<string, SimpleNodeSchema>([
					["test.string", { type: "string", kind: "leaf" }],
				]),
				allowedTypes: ["test.string"],
			};

			const actual = toJsonSchema(input);

			const expected: TreeJsonSchema = {
				// $schema: "http://json-schema.org/draft-07/schema#", // TODO?
				definitions: {
					"test.string": {
						type: "string",
						kind: "leaf",
					},
				},
				anyOf: [
					{
						$ref: "#/definitions/test.string",
					},
				],
			};
			assert.deepEqual(actual, expected);
		});
	});
});
