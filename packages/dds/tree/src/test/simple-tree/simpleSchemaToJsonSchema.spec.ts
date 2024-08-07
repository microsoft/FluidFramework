/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { JsonTreeSchema } from "../../simple-tree/index.js";
import { getJsonValidator } from "./jsonSchemaUtilities.js";
// eslint-disable-next-line import/no-internal-modules
import type { SimpleNodeSchema, SimpleTreeSchema } from "../../simple-tree/simpleSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { toJsonSchema } from "../../simple-tree/simpleSchemaToJsonSchema.js";

describe("simpleSchemaToJsonSchema", () => {
	it("Leaf schema", async () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.string", { leafKind: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.string"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/test.string",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator("Hello world", true);
		validator({}, false);
		validator([], false);
	});

	// Fluid Handles are not supported in JSON Schema export.
	// Ensure the code throws if a handle is encountered.
	it("Leaf node (Fluid Handle)", async () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.handle", { leafKind: "fluid-handle", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.handle"]),
		};

		assert.throws(() => toJsonSchema(input));
	});

	it("Array schema", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.array", { kind: "array", allowedTypes: new Set<string>(["test.string"]) }],
				["test.string", { leafKind: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.array"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.array": {
					type: "array",
					_treeNodeSchemaKind: "array",
					items: {
						anyOf: [{ $ref: "#/$defs/test.string" }],
					},
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/test.array",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator("Hello world", false);
		validator({}, false);
		validator([], true);
		validator([42], false);
		validator(["Hello", "world"], true);
		validator(["Hello", 42, "world"], false);
	});

	it("Map schema", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.map", { kind: "map", allowedTypes: new Set<string>(["test.string"]) }],
				["test.string", { leafKind: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.map"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.map": {
					type: "object",
					_treeNodeSchemaKind: "map",
					patternProperties: {
						"^.*$": { anyOf: [{ $ref: "#/$defs/test.string" }] },
					},
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/test.map",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator("Hello world", false);
		validator([], false);
		validator({}, true);
		validator(
			{
				foo: "Hello",
				bar: "World",
			},
			true,
		);
		validator(
			{
				foo: "Hello",
				bar: "World",
				baz: 42,
			},
			false,
		);
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
				["test.string", { leafKind: "string", kind: "leaf" }],
				["test.number", { leafKind: "number", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: "object",
					properties: {
						foo: {
							anyOf: [{ $ref: "#/$defs/test.number" }],
						},
						bar: {
							anyOf: [{ $ref: "#/$defs/test.string" }],
						},
					},
					required: ["bar"],
					additionalProperties: false,
				},
				"test.number": {
					type: "number",
					_treeNodeSchemaKind: "leaf",
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/test.object",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator("Hello world", false);
		validator([], false);
		validator({}, false);
		validator(
			{
				foo: 42,
			},
			false,
		);
		validator(
			{
				bar: "Hello World",
			},
			true,
		);
		validator(
			{
				foo: 42,
				bar: "Hello World",
			},
			true,
		);
		validator(
			{
				foo: 42,
				bar: "Hello World",
				baz: true,
			},
			false,
		);
	});

	it("Object schema including an identifier field", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: "object",
						fields: {
							"id": { kind: "identifier", allowedTypes: new Set<string>(["test.identifier"]) },
						},
					},
				],
				["test.identifier", { leafKind: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: "object",
					properties: {
						id: {
							anyOf: [{ $ref: "#/$defs/test.identifier" }],
						},
					},
					required: [],
					additionalProperties: false,
				},
				"test.identifier": {
					type: "string",
					_treeNodeSchemaKind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/test.object",
				},
			],
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema including a union field", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: "object",
						fields: {
							"foo": {
								kind: "required",
								allowedTypes: new Set<string>(["test.number", "test.string"]),
							},
						},
					},
				],
				["test.number", { leafKind: "number", kind: "leaf" }],
				["test.string", { leafKind: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: "object",
					properties: {
						foo: {
							anyOf: [{ $ref: "#/$defs/test.number" }, { $ref: "#/$defs/test.string" }],
						},
					},
					required: ["foo"],
					additionalProperties: false,
				},
				"test.number": {
					type: "number",
					_treeNodeSchemaKind: "leaf",
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/test.object",
				},
			],
		};
		assert.deepEqual(actual, expected);
	});

	it("Recursive object schema", () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.recursive-object",
					{
						kind: "object",
						fields: {
							"foo": {
								kind: "optional",
								allowedTypes: new Set<string>(["test.string", "test.recursive-object"]),
							},
						},
					},
				],
				["test.string", { leafKind: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.recursive-object"]),
		};
		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.recursive-object": {
					type: "object",
					_treeNodeSchemaKind: "object",
					properties: {
						foo: {
							anyOf: [
								{ $ref: "#/$defs/test.string" },
								{ $ref: "#/$defs/test.recursive-object" },
							],
						},
					},
					required: [],
					additionalProperties: false,
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/test.recursive-object",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator({}, true);
		validator({ foo: {} }, true);
		validator({ foo: "Hello world" }, true);
		validator({ foo: { foo: "Hello world" } }, true);

		validator("Hello world", false);
		validator([], false);
		validator({ foo: 42 }, false);
		validator({ foo: { foo: 42 } }, false);
		validator({ bar: "Hello world" }, false);
		validator({ foo: { bar: "Hello world" } }, false);
	});
});
