/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { getJsonSchema, SchemaFactory, type TreeJsonSchema } from "../../simple-tree/index.js";

// TODOs:
// - Identifier fields

import { hydrate } from "./utils.js";
import { getJsonValidator } from "./jsonSchemaUtilities.js";

describe.only("getJsonSchema", () => {
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
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(input, true);
		validator("Hello world", true);
		validator({}, false);
		validator([], false);
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
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(input, true);
		validator([], true);
		validator(["Hello", "world"], true);
		validator("Hello world", false);
		validator({}, false);
		validator([42], false);
		validator(["Hello", 42, "world"], false);
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
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(input, true);
		validator({}, true);
		validator(
			{
				foo: "Hello",
				bar: "World",
			},
			true,
		);
		validator("Hello world", false);
		validator([], false);
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
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(input, true);

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
				foo: 42,
				bar: "Hello World",
				baz: true,
			},
			false,
		);
	});

	it("Recursive object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class ObjectSchema extends schemaFactory.objectRecursive("recursive-object", {
			foo: schemaFactory.optionalRecursive([schemaFactory.string, () => ObjectSchema]),
		}) {}
		const input = hydrate(
			ObjectSchema,
			new ObjectSchema({ foo: new ObjectSchema({ foo: "Hello" }) }),
		);

		const actual = getJsonSchema(input);

		const expected: TreeJsonSchema = {
			definitions: {
				"test.recursive-object": {
					type: "object",
					kind: "object",
					properties: {
						foo: {
							anyOf: [
								{ $ref: "#/definitions/com.fluidframework.leaf.string" },
								{ $ref: "#/definitions/test.recursive-object" },
							],
						},
					},
					required: [],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.string": {
					type: "string",
					kind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/definitions/test.recursive-object",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(input, true);
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
