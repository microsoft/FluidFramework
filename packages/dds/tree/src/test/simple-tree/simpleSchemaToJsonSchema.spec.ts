/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import type { TreeJsonSchema } from "../../simple-tree/index.js";
import { getJsonValidator } from "./jsonSchemaUtilities.js";
// eslint-disable-next-line import/no-internal-modules
import type { SimpleNodeSchema, SimpleTreeSchema } from "../../simple-tree/simpleSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { toJsonSchema } from "../../simple-tree/simpleSchemaToJsonSchema.js";

// TODOs:
// - Identifier fields

describe.only("simpleSchemaToJsonSchema", () => {
	it("Leaf schema", async () => {
		const input: SimpleTreeSchema = {
			definitions: new Map<string, SimpleNodeSchema>([
				["test.string", { type: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.string"]),
		};

		const actual = toJsonSchema(input);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.string": {
					type: "string",
					_kind: "leaf",
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
			$defs: {
				"test.array": {
					type: "array",
					_kind: "array",
					items: {
						anyOf: [{ $ref: "#/$defs/test.string" }],
					},
				},
				"test.string": {
					type: "string",
					_kind: "leaf",
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
				["test.string", { type: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.map"]),
		};

		const actual = toJsonSchema(input);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.map": {
					type: "object",
					_kind: "map",
					patternProperties: {
						"^.*$": { anyOf: [{ $ref: "#/$defs/test.string" }] },
					},
				},
				"test.string": {
					type: "string",
					_kind: "leaf",
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
				["test.string", { type: "string", kind: "leaf" }],
				["test.number", { type: "number", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.object"]),
		};

		const actual = toJsonSchema(input);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_kind: "object",
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
					_kind: "leaf",
				},
				"test.string": {
					type: "string",
					_kind: "leaf",
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
				["test.string", { type: "string", kind: "leaf" }],
			]),
			allowedTypes: new Set<string>(["test.recursive-object"]),
		};
		const actual = toJsonSchema(input);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.recursive-object": {
					type: "object",
					_kind: "object",
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
					_kind: "leaf",
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
