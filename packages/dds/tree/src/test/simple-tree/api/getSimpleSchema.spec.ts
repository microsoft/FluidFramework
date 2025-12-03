/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	decodeSimpleSchema,
	FieldKind,
	NodeKind,
	SchemaFactory,
	SchemaFactoryAlpha,
	encodeSimpleSchema,
	stringSchema,
	type SimpleLeafNodeSchema,
	type SimpleNodeSchema,
	type SimpleObjectFieldSchema,
	type SimpleObjectNodeSchema,
	type SimpleTreeSchema,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createSchemaUpgrade } from "../../../simple-tree/core/index.js";
import { ValueSchema } from "../../../core/index.js";

import {
	copySimpleTreeSchemaWithoutMetadata,
	toSimpleTreeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/viewSchemaToSimpleSchema.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { HasUnknownOptionalFields } from "../../testTrees.js";
import { ajvValidator } from "../../codec/index.js";
import type { FormatValidator } from "../../../codec/index.js";

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

// The format validator used in these tests
const formatValidator: FormatValidator = ajvValidator;

describe("getSimpleSchema", () => {
	useSnapshotDirectory("get-simple-schema");

	it("non-copying", () => {
		const Schema = stringSchema;
		const root = SchemaFactoryAlpha.optional(Schema);

		const expected: SimpleTreeSchema = {
			root,
			definitions: new Map([[Schema.identifier, Schema]]),
		};

		const actual = toSimpleTreeSchema(root, false);

		assert.deepEqual(actual, expected);

		assert.equal(actual.root, root);
		assert.equal(actual.definitions.get(Schema.identifier), Schema);
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

		it("serialized - Field Schema", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Field Schema", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Leaf node", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Leaf node", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Union root", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Field Schema", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Array schema", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Array Schema", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Map schema", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Map schema", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Record schema", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Record schema", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Object schema", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Object schema", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

			assert.deepEqual(actual, expected);
		});

		it("serialized - Object schema including an identifier field", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Object schema including an identifier field", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Object schema including a union field", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Object schema including a union field", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
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

		it("serialized - Recursive object schema", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(Schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Recursive object schema", () => {
			const simpleTree = toSimpleTreeSchema(Schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
		});
	});

	describe("With staged schema upgrades", () => {
		const leafSchema = stringSchema;
		const schemaFactory = new SchemaFactoryAlpha("test");
		const schema = schemaFactory.optional(
			// Staged allowed types are read-only for the sake of schema migrations
			schemaFactory.types([schemaFactory.staged(leafSchema)]),
		);

		it("Should preserve isReadOnly when converting to SimpleTreeSchema", () => {
			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Optional,
					simpleAllowedTypes: new Map([
						[leafSchema.identifier, { isStaged: createSchemaUpgrade() }],
					]),
					metadata: {},
					persistedMetadata: undefined,
				},
				definitions: new Map([[leafSchema.identifier, leafSchema]]),
			};

			const actual = toSimpleTreeSchema(schema, true);
			assert.deepEqual(actual.root.simpleAllowedTypes, expected.root.simpleAllowedTypes);
		});

		it("serialized - simpleAllowedTypes", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - simpleAllowedTypes", () => {
			const simpleTree = toSimpleTreeSchema(schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
		});
	});

	describe("With allowUnknownOptionalFields in object schema", () => {
		const schema = HasUnknownOptionalFields;

		it("Should preserve allowUnknownOptionalFields when converting to SimpleTreeSchema", () => {
			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					simpleAllowedTypes: new Map([
						["test.hasUnknownOptionalFields", { isStaged: false }],
					]),
					metadata: {},
					persistedMetadata: undefined,
				},
				definitions: new Map([
					[
						"test.hasUnknownOptionalFields",
						{
							kind: NodeKind.Object,
							metadata: {},
							persistedMetadata: undefined,
							allowUnknownOptionalFields: true,
							fields: new Map([]),
						},
					],
				]),
			};

			const actual = toSimpleTreeSchema(schema, true);
			assert.deepEqual(actual, expected);
		});

		it("serialized - allowUnknownOptionalFields", () => {
			const actual = encodeSimpleSchema(toSimpleTreeSchema(schema, true));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - allowUnknownOptionalFields", () => {
			const simpleTree = toSimpleTreeSchema(schema, true);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSimpleSchema(encodeSimpleSchema(simpleTree), formatValidator);
			assert.deepEqual(actual, expected);
		});
	});
});
