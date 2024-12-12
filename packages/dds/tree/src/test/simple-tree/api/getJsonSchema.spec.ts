/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	getJsonSchema,
	NodeKind,
	SchemaFactory,
	type JsonTreeSchema,
	withMetadata,
} from "../../../simple-tree/index.js";

import { hydrate } from "../utils.js";
import { getJsonValidator } from "./jsonSchemaUtilities.js";

describe("getJsonSchema", () => {
	it("Field Schema", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.optional(schemaFactory.string, {
			metadata: { description: "An optional string." },
		});

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"com.fluidframework.leaf.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/com.fluidframework.leaf.string",
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(hydrate(Schema, "Hello world"), true);
		validator("Hello world", true);
		validator(42, false);
		validator({}, false);
		validator([], false);
		validator(null, false);
	});

	it("Leaf node", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.string;

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"com.fluidframework.leaf.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/com.fluidframework.leaf.string",
		};
		assert.deepEqual(actual, expected);

		// Verify that the generated schema is valid.
		const validator = getJsonValidator(actual);

		// Verify expected data validation behavior.
		validator(hydrate(Schema, "Hello world"), true);
		validator("Hello world", true);
		validator(42, false);
		validator({}, false);
		validator([], false);
	});

	it("Union root", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = [schemaFactory.number, schemaFactory.string] as const;

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"com.fluidframework.leaf.number": {
					type: "number",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
				"com.fluidframework.leaf.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			anyOf: [
				{
					$ref: "#/$defs/com.fluidframework.leaf.number",
				},
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
		validator(hydrate(Schema, 42), true);
		validator("Hello world", true);
		validator(42, true);
		validator(true, false);
		validator({}, false);
		validator([], false);
	});

	// Fluid Handles are not supported in JSON Schema export.
	// Ensure the code throws if a handle is encountered.
	it("Leaf node (Fluid Handle)", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.handle;

		assert.throws(() => getJsonSchema(Schema));
	});

	it("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = withMetadata(schemaFactory.array("array", schemaFactory.string), {
			description: "An array of strings",
		});

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.array": {
					type: "array",
					_treeNodeSchemaKind: NodeKind.Array,
					description: "An array of strings",
					items: {
						$ref: "#/$defs/com.fluidframework.leaf.string",
					},
				},
				"com.fluidframework.leaf.string": {
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
		// Array nodes do not satisfy AJV's array validation. This should be uncommented if/when we change this behavior.
		// validator(hydrate(Schema, ["Hello", "world"]), true);
		validator([], true);
		validator(["Hello", "world"], true);
		validator("Hello world", false);
		validator({}, false);
		validator([42], false);
		validator(["Hello", 42, "world"], false);
	});

	it("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = withMetadata(schemaFactory.map("map", schemaFactory.string), {
			description: "A map containing strings",
		});

		const actual = getJsonSchema(Schema);
		const expected: JsonTreeSchema = {
			$defs: {
				"test.map": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Map,
					description: "A map containing strings",
					patternProperties: {
						"^.*$": { $ref: "#/$defs/com.fluidframework.leaf.string" },
					},
				},
				"com.fluidframework.leaf.string": {
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
		validator(
			hydrate(
				Schema,
				new Map([
					["foo", "Hello"],
					["bar", "World"],
				]),
			),
			true,
		);
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
		const Schema = withMetadata(
			schemaFactory.object("object", {
				foo: schemaFactory.optional(schemaFactory.number, {
					metadata: { description: "A number representing the concept of Foo." },
				}),
				bar: schemaFactory.required(schemaFactory.string, {
					metadata: { description: "A string representing the concept of Bar." },
				}),
			}),
			{ description: "An object with Foo and Bar." },
		);

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
					description: "An object with Foo and Bar.",
					properties: {
						foo: {
							$ref: "#/$defs/com.fluidframework.leaf.number",
							description: "A number representing the concept of Foo.",
						},
						bar: {
							$ref: "#/$defs/com.fluidframework.leaf.string",
							description: "A string representing the concept of Bar.",
						},
					},
					required: ["bar"],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.number": {
					type: "number",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
				"com.fluidframework.leaf.string": {
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
		const Schema = schemaFactory.object("object", {
			id: schemaFactory.identifier,
		});

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
					properties: {
						id: {
							$ref: "#/$defs/com.fluidframework.leaf.string",
						},
					},
					required: [],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.object",
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema including a union field", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.object("object", {
			foo: schemaFactory.required([schemaFactory.number, schemaFactory.string]),
		});

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
					properties: {
						foo: {
							anyOf: [
								{ $ref: "#/$defs/com.fluidframework.leaf.number" },
								{ $ref: "#/$defs/com.fluidframework.leaf.string" },
							],
						},
					},
					required: ["foo"],
					additionalProperties: false,
				},
				"com.fluidframework.leaf.number": {
					type: "number",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
				"com.fluidframework.leaf.string": {
					type: "string",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.object",
		};
		assert.deepEqual(actual, expected);
	});

	it("Recursive object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.objectRecursive("recursive-object", {
			foo: schemaFactory.optionalRecursive([schemaFactory.string, () => Schema]),
		});

		const actual = getJsonSchema(Schema);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.recursive-object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
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
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
			},
			$ref: "#/$defs/test.recursive-object",
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
