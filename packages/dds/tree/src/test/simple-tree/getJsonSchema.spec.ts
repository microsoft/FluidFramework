/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { getJsonSchema, SchemaFactory, type TreeJsonSchema } from "../../simple-tree/index.js";

// TODOs:
// - Identifier fields
// - Recursive schema

// Based on ESM workaround from https://github.com/ajv-validator/ajv/issues/2047#issuecomment-1241470041 .
// In ESM, this gets the module, in cjs, it gets the default export which is the Ajv class.
import ajvModuleOrClass from "ajv";
import { hydrate } from "./utils.js";

// The first case here covers the esm mode, and the second the cjs one.
// Getting correct typing for the cjs case without breaking esm compilation proved to be difficult, so that case uses `any`
const Ajv =
	(ajvModuleOrClass as typeof ajvModuleOrClass & { default: unknown }).default ??
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ajvModuleOrClass as any);

describe.only("getJsonSchema", () => {
	function getValidator(schema: TreeJsonSchema) {
		const ajv = new Ajv({
			strict: false,
			allErrors: true,
		});
		return ajv.compile(schema);
	}

	it("Leaf node", async () => {
		const schemaFactory = new SchemaFactory("test");

		const input = hydrate(schemaFactory.string, "Hello world");
		const actual = getJsonSchema(input);

		const expected: TreeJsonSchema = {
			definitions: {
				"com.fluidframework.leaf.string": {
					type: "string",
					kind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/definitions/com.fluidframework.leaf.string",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getValidator(actual);

		// Verify expected data validation behavior.
		assert(validator(input) === true);
		assert(validator("Hello world") === true);
		assert(validator({}) === false);
		assert(validator([]) === false);
	});

	it("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const input = hydrate(schemaFactory.array("array", schemaFactory.string), [
			"Hello",
			"world",
		]);

		const actual = getJsonSchema(input);

		const expected: TreeJsonSchema = {
			definitions: {
				"test.array": {
					type: "array",
					kind: "array",
					items: {
						anyOf: [{ $ref: "#/definitions/com.fluidframework.leaf.string" }],
					},
				},
				"com.fluidframework.leaf.string": {
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
		assert(validator(input) === false); // TODO: this should succeed
		assert(validator([]) === true);
		assert(validator(["Hello", "world"]) === true);
		assert(validator("Hello world") === false);
		assert(validator({}) === false);
		assert(validator([42]) === false);
		assert(validator(["Hello", 42, "world"]) === false);
	});

	it("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const input = hydrate(
			schemaFactory.map("map", schemaFactory.string),
			new Map([
				["foo", "Hello"],
				["bar", "World"],
			]),
		);

		const actual = getJsonSchema(input);

		const expected: TreeJsonSchema = {
			definitions: {
				"test.map": {
					type: "object",
					kind: "map",
					patternProperties: {
						"^(.*)+$": { anyOf: [{ $ref: "#/definitions/com.fluidframework.leaf.string" }] },
					},
				},
				"com.fluidframework.leaf.string": {
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
		assert(validator(input) === true);
		assert(validator({}) === true);
		assert(
			validator({
				foo: "Hello",
				bar: "World",
			}) === true,
		);
		assert(validator("Hello world") === false);
		assert(validator([]) === false);
		assert(
			validator({
				foo: "Hello",
				bar: "World",
				baz: 42,
			}) === false,
		);
	});

	it("Object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class ObjectSchema extends schemaFactory.object("object", {
			foo: schemaFactory.optional(schemaFactory.number),
			bar: schemaFactory.required(schemaFactory.string),
		}) {}
		const input = hydrate(ObjectSchema, {
			foo: 42,
			bar: "Hello World",
		});

		const actual = getJsonSchema(input);

		const expected: TreeJsonSchema = {
			definitions: {
				"test.object": {
					type: "object",
					kind: "object",
					properties: {
						foo: {
							anyOf: [{ $ref: "#/definitions/com.fluidframework.leaf.number" }],
						},
						bar: {
							anyOf: [{ $ref: "#/definitions/com.fluidframework.leaf.string" }],
						},
					},
					required: ["bar"],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.number": {
					type: "number",
					kind: "leaf",
				},
				"com.fluidframework.leaf.string": {
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
		assert(validator(input) === true);
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
				foo: 42,
				bar: "Hello World",
				baz: true,
			}) === false,
		);
	});
});
