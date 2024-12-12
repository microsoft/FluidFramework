/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { FieldKind, NodeKind, type JsonTreeSchema } from "../../../simple-tree/index.js";
import { getJsonValidator } from "./jsonSchemaUtilities.js";
import type {
	SimpleNodeSchema,
	SimpleTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/simpleSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { toJsonSchema } from "../../../simple-tree/api/simpleSchemaToJsonSchema.js";
import { ValueSchema } from "../../../core/index.js";

describe("simpleSchemaToJsonSchema", () => {
	it("Leaf schema", async () => {
		const input: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				["test.string", { leafKind: ValueSchema.String, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.string"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.string",
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
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				["test.handle", { leafKind: ValueSchema.FluidHandle, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.handle"]),
		};

		assert.throws(() => toJsonSchema(input));
	});

	it("Array schema", () => {
		const input: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.array",
					{ kind: NodeKind.Array, allowedTypes: new Set<string>(["test.string"]) },
				],
				["test.string", { leafKind: ValueSchema.String, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.array"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.array": {
					type: "array",
					_treeNodeSchemaKind: NodeKind.Array,
					items: {
						$ref: "#/$defs/test.string",
					},
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.array",
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
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				["test.map", { kind: NodeKind.Map, allowedTypes: new Set<string>(["test.string"]) }],
				["test.string", { leafKind: ValueSchema.String, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.map"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.map": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Map,
					patternProperties: {
						"^.*$": { $ref: "#/$defs/test.string" },
					},
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.map",
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
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						fields: {
							"foo": {
								kind: FieldKind.Optional,
								allowedTypes: new Set<string>(["test.number"]),
								metadata: { description: "A number representing the concept of Foo." },
							},
							"bar": {
								kind: FieldKind.Required,
								allowedTypes: new Set<string>(["test.string"]),
								metadata: { description: "A string representing the concept of Bar." },
							},
							"id": {
								kind: FieldKind.Identifier,
								allowedTypes: new Set<string>(["test.string"]),
								metadata: {
									description: "Unique identifier for the test object.",
								},
							},
						},
					},
				],
				["test.string", { leafKind: ValueSchema.String, kind: NodeKind.Leaf }],
				["test.number", { leafKind: ValueSchema.Number, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
					properties: {
						foo: {
							$ref: "#/$defs/test.number",
							description: "A number representing the concept of Foo.",
						},
						bar: {
							$ref: "#/$defs/test.string",
							description: "A string representing the concept of Bar.",
						},
						id: {
							$ref: "#/$defs/test.string",
							description: "Unique identifier for the test object.",
						},
					},
					required: ["bar"],
					additionalProperties: false,
				},
				"test.number": {
					type: "number",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.object",
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
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						fields: {
							"id": {
								kind: FieldKind.Identifier,
								allowedTypes: new Set<string>(["test.identifier"]),
							},
						},
					},
				],
				["test.identifier", { leafKind: ValueSchema.String, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
					properties: {
						id: { $ref: "#/$defs/test.identifier" },
					},
					required: [],
					additionalProperties: false,
				},
				"test.identifier": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.object",
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema including a union field", () => {
		const input: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						fields: {
							"foo": {
								kind: FieldKind.Required,
								allowedTypes: new Set<string>(["test.number", "test.string"]),
							},
						},
					},
				],
				["test.number", { leafKind: ValueSchema.Number, kind: NodeKind.Leaf }],
				["test.string", { leafKind: ValueSchema.String, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
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
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
				"test.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.object",
		};
		assert.deepEqual(actual, expected);
	});

	it("Recursive object schema", () => {
		const input: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.recursive-object",
					{
						kind: NodeKind.Object,
						fields: {
							"foo": {
								kind: FieldKind.Optional,
								allowedTypes: new Set<string>(["test.string", "test.recursive-object"]),
							},
						},
					},
				],
				["test.string", { leafKind: ValueSchema.String, kind: NodeKind.Leaf }],
			]),
			allowedTypes: new Set<string>(["test.recursive-object"]),
		};
		const actual = toJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.recursive-object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
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
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.recursive-object",
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
