/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { getJsonSchema, SchemaFactory, type TreeJsonSchema } from "../../simple-tree/index.js";

import { hydrate } from "./utils.js";
import { getJsonValidator } from "./jsonSchemaUtilities.js";

describe.only("getJsonSchema", () => {
	it("Leaf node", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.string;

		const actual = getJsonSchema(Schema);

		const expected: TreeJsonSchema = {
			$defs: {
				"com.fluidframework.leaf.string": {
					type: "string",
					_kind: "leaf",
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/com.fluidframework.leaf.string",
				},
			],
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(hydrate(Schema, "Hello world"), true);
		validator("Hello world", true);
		validator({}, false);
		validator([], false);
	});

	it("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.array("array", schemaFactory.string) {}

		const actual = getJsonSchema(Schema);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.array": {
					type: "array",
					_kind: "array",
					items: {
						anyOf: [{ $ref: "#/$defs/com.fluidframework.leaf.string" }],
					},
				},
				"com.fluidframework.leaf.string": {
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
		validator(hydrate(Schema, ["Hello", "world"]), false); // TODO: this should work
		validator([], true);
		validator(["Hello", "world"], true);
		validator("Hello world", false);
		validator({}, false);
		validator([42], false);
		validator(["Hello", 42, "world"], false);
	});

	it("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.map("map", schemaFactory.string) {}

		// TODO: once Map nodes are supported, update this to test the output.
		assert.throws(() => getJsonSchema(Schema));
		// const actual = getJsonSchema(Schema);
		// const expected: TreeJsonSchema = {
		// 	definitions: {
		// 		"test.map": {
		// 			type: "object",
		// 			kind: "map",
		// 			patternProperties: {
		// 				"^.*$": { anyOf: [{ $ref: "#/$defs/com.fluidframework.leaf.string" }] },
		// 			},
		// 		},
		// 		"com.fluidframework.leaf.string": {
		// 			type: "string",
		// 			kind: "leaf",
		// 		},
		// 	},
		// 	anyOf: [
		// 		{
		// 			$ref: "#/$defs/test.map",
		// 		},
		// 	],
		// };
		// assert.deepEqual(actual, expected);

		// // Verify that the generated schema is valid.
		// const validator = getJsonValidator(actual);

		// // Verify expected data validation behavior.
		// validator(
		// 	hydrate(
		// 		Schema,
		// 		new Map([
		// 			["foo", "Hello"],
		// 			["bar", "World"],
		// 		]),
		// 	),
		// 	true,
		// );
		// validator({}, true);
		// validator(
		// 	{
		// 		foo: "Hello",
		// 		bar: "World",
		// 	},
		// 	true,
		// );
		// validator("Hello world", false);
		// validator([], false);
		// validator(
		// 	{
		// 		foo: "Hello",
		// 		bar: "World",
		// 		baz: 42,
		// 	},
		// 	false,
		// );
	});

	it("Object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.optional(schemaFactory.number),
			bar: schemaFactory.required(schemaFactory.string),
		}) {}

		const actual = getJsonSchema(Schema);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_kind: "object",
					properties: {
						foo: {
							anyOf: [{ $ref: "#/$defs/com.fluidframework.leaf.number" }],
						},
						bar: {
							anyOf: [{ $ref: "#/$defs/com.fluidframework.leaf.string" }],
						},
					},
					required: ["bar"],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.number": {
					type: "number",
					_kind: "leaf",
				},
				"com.fluidframework.leaf.string": {
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
		validator(
			hydrate(Schema, {
				foo: 42,
				bar: "Hello World",
			}),
			true,
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

	it("Object schema including an identifier field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			id: schemaFactory.identifier,
		}) {}

		const actual = getJsonSchema(Schema);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_kind: "object",
					properties: {
						id: {
							anyOf: [{ $ref: "#/$defs/com.fluidframework.leaf.string" }],
						},
					},
					required: [],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.string": {
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
	});

	it("Recursive object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.objectRecursive("recursive-object", {
			foo: schemaFactory.optionalRecursive([schemaFactory.string, () => Schema]),
		}) {}

		const actual = getJsonSchema(Schema);

		const expected: TreeJsonSchema = {
			$defs: {
				"test.recursive-object": {
					type: "object",
					_kind: "object",
					properties: {
						foo: {
							anyOf: [
								{ $ref: "#/$defs/com.fluidframework.leaf.string" },
								{ $ref: "#/$defs/test.recursive-object" },
							],
						},
					},
					required: [],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.string": {
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
		validator(hydrate(Schema, new Schema({ foo: new Schema({ foo: "Hello" }) })), true);
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

	it("JSON Schema cached on node schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.string;

		const firstQuery = getJsonSchema(Schema);
		const secondQuery = getJsonSchema(Schema);

		// Object equality to ensure the same object is returned by subsequent calls.
		return assert.equal(firstQuery, secondQuery);
	});
});
