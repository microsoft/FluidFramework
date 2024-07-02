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

describe.only("JsonSchema", () => {
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

		it("Array schema", () => {
			const input: SimpleTreeSchema = {
				definitions: new Map<string, SimpleNodeSchema>([
					["test.array", { kind: "array", allowedTypes: new Set<string>(["test.string"]) }],
					["test.string", { type: "string", kind: "leaf" }],
				]),
				allowedTypes: ["test.array"],
			};

			const actual = toJsonSchema(input);

			const expected: TreeJsonSchema = {
				// $schema: "http://json-schema.org/draft-07/schema#", // TODO?
				definitions: {
					"test.array": {
						type: "array",
						kind: "array",
						items: {
							type: [{ $ref: "#/definitions/test.string" }],
						},
					},
					"test.string": {
						type: "string",
						kind: "leaf",
					},
				},
				anyOf: [
					{
						$ref: "#/definitions/test.array",
					},
				],
			};
			assert.deepEqual(actual, expected);
		});

		it("Map schema", () => {
			const input: SimpleTreeSchema = {
				definitions: new Map<string, SimpleNodeSchema>([
					["test.map", { kind: "map", allowedTypes: new Set<string>(["test.string"]) }],
					["test.string", { type: "string", kind: "leaf" }],
				]),
				allowedTypes: ["test.map"],
			};

			const actual = toJsonSchema(input);

			const expected: TreeJsonSchema = {
				// $schema: "http://json-schema.org/draft-07/schema#", // TODO?
				definitions: {
					"test.map": {
						type: "object",
						kind: "map",
						additionalProperties: {
							type: [{ $ref: "#/definitions/test.string" }],
						},
					},
					"test.string": {
						type: "string",
						kind: "leaf",
					},
				},
				anyOf: [
					{
						$ref: "#/definitions/test.map",
					},
				],
			};
			assert.deepEqual(actual, expected);
		});
	});
});
