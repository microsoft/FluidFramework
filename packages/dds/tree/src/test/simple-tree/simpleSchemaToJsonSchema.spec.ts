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
import { getJsonValidator } from "./jsonSchemaUtilities.js";

// TODOs:
// - Identifier fields
// - Recursive schema

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
			definitions: {
				"test.array": {
					type: "array",
					kind: "array",
					items: {
						anyOf: [{ $ref: "#/definitions/test.string" }],
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
			definitions: {
				"test.map": {
					type: "object",
					kind: "map",
					patternProperties: {
						"^(.*)+$": { anyOf: [{ $ref: "#/definitions/test.string" }] },
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
					additionalProperties: false,
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
});
