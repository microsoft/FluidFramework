/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	deserializeCompatibilitySchema,
	FieldKind,
	NodeKind,
	SchemaFactory,
	SchemaFactoryAlpha,
	serializeCompatibilitySchema,
	stringSchema,
	toViewCompatibilityTreeSchema,
	TreeViewConfigurationAlpha,
	type SimpleLeafNodeSchema,
	type SimpleNodeSchema,
	type SimpleObjectFieldSchema,
	type SimpleObjectNodeSchema,
	type SimpleTreeSchema,
} from "../../../simple-tree/index.js";
import { ValueSchema } from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toSimpleTreeSchema } from "../../../simple-tree/api/viewSchemaToSimpleSchema.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";

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
	useSnapshotDirectory("get-simple-schema");

	describe("non-copying", () => {
		const Schema = stringSchema;
		const root = SchemaFactoryAlpha.optional(Schema);

		const expected: SimpleTreeSchema = {
			root,
			definitions: new Map([[Schema.identifier, Schema]]),
		};

		it("toSimpleTreeSchema", () => {
			const actual = toSimpleTreeSchema(root, false);

			assert.deepEqual(actual, expected);

			assert.equal(actual.root, root);
			assert.equal(actual.definitions.get(Schema.identifier), Schema);
		});

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: root });
			const actual = toViewCompatibilityTreeSchema(treeView, false);

			assert.deepEqual(actual, expected);

			assert.equal(actual.root, root);
			assert.equal(actual.definitions.get(Schema.identifier), Schema);
		});
	});

	describe("Field Schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.optional(schemaFactory.string, {
			metadata: { description: "An optional string." },
		});

		it("toSimpleTreeSchema", () => {
			const actual = toSimpleTreeSchema(Schema, true);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Optional,
					metadata: { description: "An optional string." },
					simpleAllowedTypes: new Map([
						["com.fluidframework.leaf.string", { isStaged: false }],
					]),
					persistedMetadata: undefined,
				},
				definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
			};

			assert.deepEqual(actual, expected);
		});

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Optional,
					metadata: { description: "An optional string." },
					simpleAllowedTypes: new Map([
						["com.fluidframework.leaf.string", { isStaged: false }],
					]),
					persistedMetadata: undefined,
				},
				definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
			};

			assert.deepEqual(actual, expected);
		});

		it("view compatibility schema - Field Schema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});

		it("Roundtrip view compatibility schema serialization - Field Schema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = deserializeCompatibilitySchema(serializeCompatibilitySchema(treeView));
			assert.deepEqual(actual, treeView);
		});
	});

	describe("Leaf node", () => {
		const Schema = SchemaFactory.string;

		it("toSimpleTreeSchema", () => {
			const actual = toSimpleTreeSchema(Schema, true);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: {},
					simpleAllowedTypes: new Map([
						["com.fluidframework.leaf.string", { isStaged: false }],
					]),
					persistedMetadata: undefined,
				},
				definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
			};

			assert.deepEqual(actual, expected);
		});

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: {},
					simpleAllowedTypes: new Map([
						["com.fluidframework.leaf.string", { isStaged: false }],
					]),
					persistedMetadata: undefined,
				},
				definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
			};

			assert.deepEqual(actual, expected);
		});

		it("view compatibility schema - Leaf node", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Union root", () => {
		const Schema = [SchemaFactory.number, SchemaFactory.string];

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

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

		it("view compatibility schema - Union root", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.array("array", schemaFactory.string) {}

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

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

		it("view compatibility schema - Array schema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.map("map", schemaFactory.string) {}

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

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

		it("view compatibility schema - Map schema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Record schema", () => {
		const schemaFactory = new SchemaFactoryAlpha("test");
		class Schema extends schemaFactory.record("record", schemaFactory.string) {}

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

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

		it("view compatibility schema - Record schema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.optional(schemaFactory.number),
			bar: schemaFactory.required(schemaFactory.string),
		}) {}

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

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
							allowUnknownOptionalFields: false,
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

		it("view compatibility schema - Object schema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Object schema including an identifier field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			id: schemaFactory.identifier,
		}) {}

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });

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
							allowUnknownOptionalFields: false,
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

			const actual = toViewCompatibilityTreeSchema(treeView, true);
			assert.deepEqual(actual, expected);
		});

		it("view compatibility schema - Object schema including an identifier field", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Object schema including a union field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.required([schemaFactory.number, schemaFactory.string]),
		}) {}

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });

			// Must enable copy so deep equality passes.
			const actual = toViewCompatibilityTreeSchema(treeView, true);

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
							allowUnknownOptionalFields: false,
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

		it("view compatibility schema - Object schema including a union field", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});

	describe("Recursive object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.objectRecursive("recursive-object", {
			foo: schemaFactory.optionalRecursive([schemaFactory.string, () => Schema]),
		}) {}

		it("toSimpleTreeSchema", () => {
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

		it("toViewCompatibilityTreeSchema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = toViewCompatibilityTreeSchema(treeView, true);

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
							allowUnknownOptionalFields: false,
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

		it("view compatibility schema - Recursive object schema", () => {
			const treeView = new TreeViewConfigurationAlpha({ schema: Schema });
			const actual = serializeCompatibilitySchema(
				toViewCompatibilityTreeSchema(treeView, true),
			);
			takeJsonSnapshot(actual);
		});
	});
});
