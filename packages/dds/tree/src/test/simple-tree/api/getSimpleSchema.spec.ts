/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	FieldKind,
	NodeKind,
	SchemaFactory,
	SchemaFactoryAlpha,
	stringSchema,
	type SimpleLeafNodeSchema,
	type SimpleNodeSchema,
	type SimpleObjectFieldSchema,
	type SimpleObjectNodeSchema,
	type SimpleTreeSchema,
} from "../../../simple-tree/index.js";
import { ValueSchema } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { toSimpleTreeSchema } from "../../../simple-tree/api/viewSchemaToSimpleSchema.js";

const simpleString: SimpleLeafNodeSchema = {
	leafKind: ValueSchema.String,
	kind: NodeKind.Leaf,
	metadata: {},
	persistedMetadata: undefined,
};

const simpleNumber: SimpleLeafNodeSchema = {
	leafKind: ValueSchema.Number,
	kind: NodeKind.Leaf,
	metadata: {},
	persistedMetadata: undefined,
};

describe("getSimpleSchema", () => {
	it("non-copying", () => {
		const Schema = stringSchema;
		const root = SchemaFactoryAlpha.optional(Schema);

		const actual = toSimpleTreeSchema(root, false);

		const expected: SimpleTreeSchema = {
			root,
			definitions: new Map([[Schema.identifier, Schema]]),
		};
		assert.deepEqual(actual, expected);

		assert.equal(actual.root, root);
		assert.equal(actual.definitions.get(Schema.identifier), Schema);
	});

	it("Field Schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.optional(schemaFactory.string, {
			metadata: { description: "An optional string." },
		});

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Optional,
				metadata: { description: "An optional string." },
				simpleAllowedTypes: new Map([["com.fluidframework.leaf.string", { isStaged: false }]]),
				persistedMetadata: undefined,
			},
			definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Leaf node", () => {
		const Schema = SchemaFactory.string;

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				simpleAllowedTypes: new Map([["com.fluidframework.leaf.string", { isStaged: false }]]),
				persistedMetadata: undefined,
			},
			definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Union root", () => {
		const Schema = [SchemaFactory.number, SchemaFactory.string];

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([
					["com.fluidframework.leaf.number", { isStaged: false }],
					["com.fluidframework.leaf.string", { isStaged: false }],
				]),
			},
			definitions: new Map([
				["com.fluidframework.leaf.number", simpleNumber],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.array("array", schemaFactory.string) {}

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([["test.array", { isStaged: false }]]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.array",
					{
						kind: NodeKind.Array,
						simpleAllowedTypes: new Map([
							["com.fluidframework.leaf.string", { isStaged: false }],
						]),
						metadata: {},
						persistedMetadata: undefined,
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.map("map", schemaFactory.string) {}

		const actual = toSimpleTreeSchema(Schema, true);
		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([["test.map", { isStaged: false }]]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.map",
					{
						kind: NodeKind.Map,
						metadata: {},
						persistedMetadata: undefined,
						simpleAllowedTypes: new Map([
							["com.fluidframework.leaf.string", { isStaged: false }],
						]),
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Record schema", () => {
		const schemaFactory = new SchemaFactoryAlpha("test");
		class Schema extends schemaFactory.record("record", schemaFactory.string) {}

		const actual = toSimpleTreeSchema(Schema, true);
		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([["test.record", { isStaged: false }]]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.record",
					{
						kind: NodeKind.Record,
						metadata: {},
						persistedMetadata: undefined,
						simpleAllowedTypes: new Map([
							["com.fluidframework.leaf.string", { isStaged: false }],
						]),
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.optional(schemaFactory.number),
			bar: schemaFactory.required(schemaFactory.string),
		}) {}

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([["test.object", { isStaged: false }]]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						metadata: {},
						persistedMetadata: undefined,
						fields: new Map<string, SimpleObjectFieldSchema>([
							[
								"foo",
								{
									kind: FieldKind.Optional,
									metadata: {},
									persistedMetadata: undefined,
									simpleAllowedTypes: new Map([
										["com.fluidframework.leaf.number", { isStaged: false }],
									]),
									storedKey: "foo",
								},
							],
							[
								"bar",
								{
									kind: FieldKind.Required,
									metadata: {},
									persistedMetadata: undefined,
									simpleAllowedTypes: new Map([
										["com.fluidframework.leaf.string", { isStaged: false }],
									]),
									storedKey: "bar",
								},
							],
						]),
					} satisfies SimpleObjectNodeSchema,
				],
				["com.fluidframework.leaf.number", simpleNumber],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema including an identifier field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			id: schemaFactory.identifier,
		}) {}

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([["test.object", { isStaged: false }]]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						metadata: {},
						persistedMetadata: undefined,
						fields: new Map([
							[
								"id",
								{
									kind: FieldKind.Identifier,
									metadata: {},
									persistedMetadata: undefined,
									simpleAllowedTypes: new Map([
										["com.fluidframework.leaf.string", { isStaged: false }],
									]),
									storedKey: "id",
								},
							],
						]),
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema including a union field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.required([schemaFactory.number, schemaFactory.string]),
		}) {}

		// Must enable copy so deep equality passes.
		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([["test.object", { isStaged: false }]]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						metadata: {},
						persistedMetadata: undefined,
						fields: new Map([
							[
								"foo",
								{
									kind: FieldKind.Required,
									metadata: {},
									persistedMetadata: undefined,
									simpleAllowedTypes: new Map([
										["com.fluidframework.leaf.number", { isStaged: false }],
										["com.fluidframework.leaf.string", { isStaged: false }],
									]),
									storedKey: "foo",
								},
							],
						]),
					},
				],
				["com.fluidframework.leaf.number", simpleNumber],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Recursive object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.objectRecursive("recursive-object", {
			foo: schemaFactory.optionalRecursive([schemaFactory.string, () => Schema]),
		}) {}

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				metadata: {},
				persistedMetadata: undefined,
				simpleAllowedTypes: new Map([["test.recursive-object", { isStaged: false }]]),
			},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.recursive-object",
					{
						kind: NodeKind.Object,
						metadata: {},
						persistedMetadata: undefined,
						fields: new Map([
							[
								"foo",
								{
									kind: FieldKind.Optional,
									metadata: {},
									persistedMetadata: undefined,
									simpleAllowedTypes: new Map([
										["com.fluidframework.leaf.string", { isStaged: false }],
										["test.recursive-object", { isStaged: false }],
									]),
									storedKey: "foo",
								},
							],
						]),
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
		};
		assert.deepEqual(actual, expected);
	});
});
