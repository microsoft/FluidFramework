/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	FieldKind,
	generateSchemaFromSimpleSchema,
	getJsonSchema,
	NodeKind,
	normalizeFieldSchema,
	numberSchema,
	SchemaFactoryAlpha,
	stringSchema,
	type JsonObjectNodeSchema,
	type JsonTreeSchema,
	type UnsafeUnknownSchema,
} from "../../../simple-tree/index.js";
import { getJsonValidator } from "./jsonSchemaUtilities.js";
import type {
	SimpleNodeSchema,
	SimpleTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/simpleSchema.js";

import {
	convertObjectNodeSchema,
	toJsonSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/simpleSchemaToJsonSchema.js";
import { ValueSchema } from "../../../core/index.js";
import { testSimpleTrees } from "../../testTrees.js";
import { TreeAlpha } from "../../../shared-tree/index.js";

function simpleToJsonSchema(simpleSchema: SimpleTreeSchema): JsonTreeSchema {
	const schema = generateSchemaFromSimpleSchema(simpleSchema);
	return toJsonSchema(schema, {
		requireFieldsWithDefaults: false,
		useStoredKeys: false,
	});
}

describe("simpleSchemaToJsonSchema", () => {
	it("Leaf schema", () => {
		const input: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				allowedTypesIdentifiers: new Set<string>([stringSchema.identifier]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[stringSchema.identifier, stringSchema],
			]),
		};

		const actual = simpleToJsonSchema(input);

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
		validator("Hello world", true);
		validator({}, false);
		validator([], false);
	});

	// Fluid Handles are not supported in JSON Schema export.
	// Ensure the code throws if a handle is encountered.
	it("Leaf node (Fluid Handle)", () => {
		const input: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				allowedTypesIdentifiers: new Set<string>(["test.handle"]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.handle",
					{ leafKind: ValueSchema.FluidHandle, metadata: {}, kind: NodeKind.Leaf },
				],
			]),
		};

		assert.throws(() => simpleToJsonSchema(input));
	});

	it("Array schema", () => {
		const input: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				allowedTypesIdentifiers: new Set<string>(["test.array"]),
				metadata: {},
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.array",
					{
						kind: NodeKind.Array,
						metadata: {},
						allowedTypesIdentifiers: new Set<string>([stringSchema.identifier]),
					},
				],
				[stringSchema.identifier, stringSchema],
			]),
		};

		const actual = simpleToJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.array": {
					type: "array",
					_treeNodeSchemaKind: NodeKind.Array,
					items: {
						$ref: "#/$defs/com.fluidframework.leaf.string",
					},
				},
				[stringSchema.identifier]: {
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
			root: {
				kind: FieldKind.Required,
				allowedTypesIdentifiers: new Set<string>(["test.map"]),
				metadata: {},
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.map",
					{
						kind: NodeKind.Map,
						metadata: {},
						allowedTypesIdentifiers: new Set<string>([stringSchema.identifier]),
					},
				],
				[stringSchema.identifier, stringSchema],
			]),
		};

		const actual = simpleToJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.map": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Map,
					patternProperties: {
						"^.*$": { $ref: "#/$defs/com.fluidframework.leaf.string" },
					},
				},
				[stringSchema.identifier]: {
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

	describe("convertObjectNodeSchema", () => {
		it("empty", () => {
			const schemaFactory = new SchemaFactoryAlpha("test");
			const empty = schemaFactory.object("empty", {});
			const emptyJson = convertObjectNodeSchema(empty, {
				requireFieldsWithDefaults: false,
				useStoredKeys: false,
			});
			const expectedEmpty: JsonObjectNodeSchema = {
				type: "object",
				_treeNodeSchemaKind: NodeKind.Object,
				properties: {},
				required: [],
				additionalProperties: false,
			};
			assert.deepEqual(emptyJson, expectedEmpty);
		});

		it("withField", () => {
			const schemaFactory = new SchemaFactoryAlpha("test");
			class WithField extends schemaFactory.object("withField", {
				prop: schemaFactory.optional(schemaFactory.number, {
					key: "stored",
					metadata: { description: "The description" },
				}),
			}) {}
			const withFieldJson = convertObjectNodeSchema(WithField, {
				requireFieldsWithDefaults: false,
				useStoredKeys: false,
			});
			const expectedWithField: JsonObjectNodeSchema = {
				type: "object",
				_treeNodeSchemaKind: NodeKind.Object,
				properties: {
					prop: {
						$ref: "#/$defs/com.fluidframework.leaf.number",
						description: "The description",
					},
				},
				required: [],
				additionalProperties: false,
			};
			assert.deepEqual(withFieldJson, expectedWithField);
		});
	});

	it("Object schema", () => {
		const input: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				allowedTypesIdentifiers: new Set<string>(["test.object"]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						metadata: {},
						fields: new Map([
							[
								"foo",
								{
									kind: FieldKind.Optional,
									allowedTypesIdentifiers: new Set<string>([numberSchema.identifier]),
									metadata: { description: "A number representing the concept of Foo." },
									storedKey: "foo",
								},
							],
							[
								"bar",
								{
									kind: FieldKind.Required,
									allowedTypesIdentifiers: new Set<string>([stringSchema.identifier]),
									metadata: { description: "A string representing the concept of Bar." },
									storedKey: "bar",
								},
							],
							[
								"id",
								{
									kind: FieldKind.Identifier,
									allowedTypesIdentifiers: new Set<string>([stringSchema.identifier]),
									metadata: {
										description: "Unique identifier for the test object.",
									},
									storedKey: "id",
								},
							],
						]),
					},
				],
				[stringSchema.identifier, stringSchema],
				[numberSchema.identifier, numberSchema],
			]),
		};

		const actual = simpleToJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
					properties: {
						foo: {
							$ref: "#/$defs/com.fluidframework.leaf.number",
							description: "A number representing the concept of Foo.",
						},
						bar: {
							$ref: "#/$defs/com.fluidframework.leaf.string",
							description: "A string representing the concept of Bar.",
						},
						id: {
							$ref: "#/$defs/com.fluidframework.leaf.string",
							description: "Unique identifier for the test object.",
						},
					},
					required: ["bar", "id"],
					additionalProperties: false,
				},
				[numberSchema.identifier]: {
					type: "number",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
				[stringSchema.identifier]: {
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
			false,
		);
		validator(
			{
				bar: "Hello World",
				id: "text",
			},
			true,
		);
		validator(
			{
				foo: 42,
				bar: "Hello World",
				id: "text",
			},
			true,
		);
		validator(
			{
				foo: 42,
				bar: "Hello World",
				baz: true,
				id: "text",
			},
			false,
		);
	});

	it("Object schema including an identifier field", () => {
		const input: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				allowedTypesIdentifiers: new Set<string>(["test.object"]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						metadata: {},
						fields: new Map([
							[
								"id",
								{
									kind: FieldKind.Identifier,
									allowedTypesIdentifiers: new Set<string>([stringSchema.identifier]),
									storedKey: "id",
									metadata: {},
								},
							],
						]),
					},
				],
				[stringSchema.identifier, stringSchema],
			]),
		};

		const actual = simpleToJsonSchema(input);

		const expected: JsonTreeSchema = {
			$defs: {
				"test.object": {
					type: "object",
					_treeNodeSchemaKind: NodeKind.Object,
					properties: {
						id: { $ref: "#/$defs/com.fluidframework.leaf.string" },
					},
					// The identifier field is technically required, it just has a default provider.
					// TODO: Support for generating schema for insertable content (concise tree with fields that have default providers as optional) is now implemented: refactor tests so it can be validated.
					required: ["id"],
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
		const input: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				allowedTypesIdentifiers: new Set<string>(["test.object"]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						metadata: {},
						fields: new Map([
							[
								"foo",
								{
									kind: FieldKind.Required,
									metadata: {},
									allowedTypesIdentifiers: new Set<string>([
										numberSchema.identifier,
										stringSchema.identifier,
									]),
									storedKey: "foo",
								},
							],
						]),
					},
				],
				[numberSchema.identifier, numberSchema],
				[stringSchema.identifier, stringSchema],
			]),
		};

		const actual = simpleToJsonSchema(input);

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
				[numberSchema.identifier]: {
					type: "number",
					_treeNodeSchemaKind: NodeKind.Leaf,
				},
				[stringSchema.identifier]: {
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
			root: {
				kind: FieldKind.Required,
				metadata: {},
				allowedTypesIdentifiers: new Set<string>(["test.recursive-object"]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.recursive-object",
					{
						kind: NodeKind.Object,
						metadata: {},
						fields: new Map([
							[
								"foo",
								{
									kind: FieldKind.Optional,
									metadata: {},
									allowedTypesIdentifiers: new Set<string>([
										stringSchema.identifier,
										"test.recursive-object",
									]),
									storedKey: "foo",
								},
							],
						]),
					},
				],
				[stringSchema.identifier, stringSchema],
			]),
		};
		const actual = simpleToJsonSchema(input);

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
				[stringSchema.identifier]: {
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

	describe("test trees", () => {
		for (const testTree of testSimpleTrees) {
			// Skip these unsupported cases
			if (testTree.name === "empty" || testTree.name === "handle") {
				continue;
			}

			it(testTree.name, () => {
				const data = testTree.root;
				const tree = TreeAlpha.create<UnsafeUnknownSchema>(testTree.schema, data());
				const testSchema = normalizeFieldSchema(testTree.schema).allowedTypes;

				{
					const withPropertyKeys = TreeAlpha.exportConcise(tree, { useStoredKeys: false });
					const jsonSchema = getJsonSchema(testSchema, {
						requireFieldsWithDefaults: true,
						useStoredKeys: false,
					});
					const validator = getJsonValidator(jsonSchema);
					validator(withPropertyKeys, true);
				}

				{
					const withStoredKeys = TreeAlpha.exportConcise(tree, { useStoredKeys: true });
					const jsonSchema = getJsonSchema(testSchema, {
						requireFieldsWithDefaults: true,
						useStoredKeys: true,
					});
					const validator = getJsonValidator(jsonSchema);
					validator(withStoredKeys, true);
				}

				{
					const withPropertyKeys = TreeAlpha.exportConcise(tree, { useStoredKeys: false });
					const jsonSchema = getJsonSchema(testSchema, {
						requireFieldsWithDefaults: false,
						useStoredKeys: false,
					});
					const validator = getJsonValidator(jsonSchema);
					validator(withPropertyKeys, true);
				}

				{
					const withStoredKeys = TreeAlpha.exportConcise(tree, { useStoredKeys: true });
					const jsonSchema = getJsonSchema(testSchema, {
						requireFieldsWithDefaults: false,
						useStoredKeys: true,
					});
					const validator = getJsonValidator(jsonSchema);
					validator(withStoredKeys, true);
				}
			});
		}
	});
});
