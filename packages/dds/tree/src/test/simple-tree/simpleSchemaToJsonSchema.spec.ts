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

// TODOs:
// - Identifier fields

// Based on ESM workaround from https://github.com/ajv-validator/ajv/issues/2047#issuecomment-1241470041 .
// In ESM, this gets the module, in cjs, it gets the default export which is the Ajv class.
import ajvModuleOrClass from "ajv";

// The first case here covers the esm mode, and the second the cjs one.
// Getting correct typing for the cjs case without breaking esm compilation proved to be difficult, so that case uses `any`
const Ajv =
	(ajvModuleOrClass as typeof ajvModuleOrClass & { default: unknown }).default ??
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ajvModuleOrClass as any);

describe("simpleSchemaToJsonSchema", () => {
	function getValidator(schema: TreeJsonSchema) {
		const ajv = new Ajv({
			strict: false,
			allErrors: true,
		});
		return ajv.compile(schema);
	}

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
		const validator = getValidator(actual);

		// Verify expected data validation behavior.
		assert(validator("Hello world") === true);
		assert(validator({}) === false);
		assert(validator([]) === false);
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
		const validator = getValidator(actual);

		// Verify expected data validation behavior.
		assert(validator("Hello world") === false);
		assert(validator({}) === false);
		assert(validator([]) === true);
		assert(validator([42]) === false);
		assert(validator(["Hello", "world"]) === true);
		assert(validator(["Hello", 42, "world"]) === false);
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
		const validator = getValidator(actual);

		// Verify expected data validation behavior.
		assert(validator("Hello world") === false);
		assert(validator([]) === false);
		assert(validator({}) === true);
		assert(
			validator({
				foo: "Hello",
				bar: "World",
			}) === true,
		);
		assert(
			validator({
				foo: "Hello",
				bar: "World",
				baz: 42,
			}) === false,
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
		const validator = getValidator(actual);

		// Verify expected data validation behavior.
		assert(validator("Hello world") === false);
		assert(validator([]) === false);
		assert(validator({}) === false);
		assert(
			validator({
				foo: 42,
			}) === false,
		);
		assert(
			validator({
				bar: "Hello World",
			}) === true,
		);
		assert(
			validator({
				foo: 42,
				bar: "Hello World",
			}) === true,
		);
		assert(
			validator({
				foo: 42,
				bar: "Hello World",
				baz: true,
			}) === false,
		);
	});
});
