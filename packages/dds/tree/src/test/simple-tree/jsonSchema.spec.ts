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
				allowedTypes: new Set<string>(["test.string"]),
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
				allowedTypes: new Set<string>(["test.array"]),
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
				allowedTypes: new Set<string>(["test.map"]),
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

		it("Object schema", () => {
			const input: SimpleTreeSchema = {
				definitions: new Map<string, SimpleNodeSchema>([
					[
						"test.object",
						{
							kind: "object",
							fields: {
								"foo": { kind: "optional", allowedTypes: new Set<string>(["test.number"]) },
								"bar": { kind: "required", allowedTypes: new Set<string>(["test.string"]) },
							},
						},
					],
					["test.string", { type: "string", kind: "leaf" }],
					["test.number", { type: "number", kind: "leaf" }],
				]),
				allowedTypes: new Set<string>(["test.object"]),
			};

			const actual = toJsonSchema(input);

			const expected: TreeJsonSchema = {
				// $schema: "http://json-schema.org/draft-07/schema#", // TODO?
				definitions: {
					"test.object": {
						type: "object",
						kind: "object",
						properties: {
							foo: {
								anyOf: [{ $ref: "#/definitions/test.number" }],
							},
							bar: {
								anyOf: [{ $ref: "#/definitions/test.string" }],
							},
						},
						required: ["bar"],
					},
					"test.number": {
						type: "number",
						kind: "leaf",
					},
					"test.string": {
						type: "string",
						kind: "leaf",
					},
				},
				anyOf: [
					{
						$ref: "#/definitions/test.object",
					},
				],
			};
			assert.deepEqual(actual, expected);
		});
	});
});
