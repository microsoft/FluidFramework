/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	decodeSchemaCompatibilitySnapshot,
	FieldKind,
	NodeKind,
	SchemaFactory,
	SchemaFactoryAlpha,
	encodeSchemaCompatibilitySnapshot,
	stringSchema,
	type SimpleLeafNodeSchema,
	type SimpleNodeSchema,
	type SimpleObjectFieldSchema,
	type SimpleObjectNodeSchema,
	type SimpleTreeSchema,
	getSimpleSchema,
	type SimpleFieldSchema,
	createTreeSchema,
	type SchemaType,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { transformSimpleSchema } from "../../../simple-tree/toStoredSchema.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createSchemaUpgrade, Unchanged } from "../../../simple-tree/core/index.js";
import { ValueSchema } from "../../../core/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { HasUnknownOptionalFields } from "../../testTrees.js";
import { ajvValidator } from "../../codec/index.js";
import type { FormatValidator } from "../../../codec/index.js";
import type { Mutable } from "../../../util/index.js";

const simpleString: SimpleLeafNodeSchema<SchemaType.View> = {
	leafKind: ValueSchema.String,
	kind: NodeKind.Leaf,
	metadata: { custom: undefined, description: undefined },
	persistedMetadata: undefined,
};

const simpleNumber: SimpleLeafNodeSchema<SchemaType.View> = {
	leafKind: ValueSchema.Number,
	kind: NodeKind.Leaf,
	metadata: { custom: undefined, description: undefined },
	persistedMetadata: undefined,
};

// The format validator used in these tests
const formatValidator: FormatValidator = ajvValidator;

/**
 * Util for testing: makes a copy of the SimpleTreeSchema with all metadata removed.
 *
 * A better way to do this is round trip through encodeSimpleSchema/decodeSchemaCompatibilitySnapshot, but this exists to test that.
 */
function copySimpleTreeSchemaWithoutMetadata(simpleTree: SimpleTreeSchema): SimpleTreeSchema {
	function stripFieldSchemaMetadata(field: SimpleFieldSchema): void {
		const f = field as Mutable<SimpleFieldSchema>;
		f.metadata = {};
		f.persistedMetadata = undefined;
	}

	const copy = transformSimpleSchema(simpleTree, Unchanged);
	for (const value of copy.definitions.values()) {
		const m = value as Mutable<SimpleNodeSchema>;
		m.metadata = {};
		m.persistedMetadata = undefined;

		if (m.kind === NodeKind.Object) {
			for (const field of m.fields.values()) {
				stripFieldSchemaMetadata(field);
			}
		}
	}

	stripFieldSchemaMetadata(copy.root);
	return copy;
}

describe("getSimpleSchema", () => {
	useSnapshotDirectory("get-simple-schema");

	describe("Field Schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.optional(schemaFactory.string, {
			metadata: { description: "An optional string." },
		});

		it("toSimpleTreeSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Optional,
					metadata: { description: "An optional string.", custom: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(getSimpleSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Field Schema", () => {
			const simpleTree = getSimpleSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Leaf node", () => {
		const Schema = SchemaFactory.string;

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Leaf node", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Union root", () => {
		const Schema = [SchemaFactory.number, SchemaFactory.string];

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Field Schema", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.array("array", schemaFactory.string) {}

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
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
							metadata: { custom: undefined, description: undefined },
							persistedMetadata: undefined,
						},
					],
					["com.fluidframework.leaf.string", simpleString],
				]),
			};

			assert.deepEqual(actual, expected);
		});

		it("serialized - Array schema", () => {
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Array Schema", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.map("map", schemaFactory.string) {}

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
					persistedMetadata: undefined,
					simpleAllowedTypes: new Map([["test.map", { isStaged: false }]]),
				},
				definitions: new Map<string, SimpleNodeSchema>([
					[
						"test.map",
						{
							kind: NodeKind.Map,
							metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Map schema", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Record schema", () => {
		const schemaFactory = new SchemaFactoryAlpha("test");
		class Schema extends schemaFactory.record("record", schemaFactory.string) {}

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
					persistedMetadata: undefined,
					simpleAllowedTypes: new Map([["test.record", { isStaged: false }]]),
				},
				definitions: new Map<string, SimpleNodeSchema>([
					[
						"test.record",
						{
							kind: NodeKind.Record,
							metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Record schema", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.optional(schemaFactory.number),
			bar: schemaFactory.required(schemaFactory.string),
		}) {}

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
					persistedMetadata: undefined,
					simpleAllowedTypes: new Map([["test.object", { isStaged: false }]]),
				},
				definitions: new Map<string, SimpleNodeSchema>([
					[
						"test.object",
						{
							kind: NodeKind.Object,
							metadata: { custom: undefined, description: undefined },
							persistedMetadata: undefined,
							allowUnknownOptionalFields: false,
							fields: new Map<string, SimpleObjectFieldSchema>([
								[
									"foo",
									{
										kind: FieldKind.Optional,
										metadata: { custom: undefined, description: undefined },
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
										metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Object schema", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Object schema including an identifier field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			id: schemaFactory.identifier,
		}) {}

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
					persistedMetadata: undefined,
					simpleAllowedTypes: new Map([["test.object", { isStaged: false }]]),
				},
				definitions: new Map<string, SimpleNodeSchema>([
					[
						"test.object",
						{
							kind: NodeKind.Object,
							metadata: { custom: undefined, description: undefined },
							persistedMetadata: undefined,
							allowUnknownOptionalFields: false,
							fields: new Map([
								[
									"id",
									{
										kind: FieldKind.Identifier,
										metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Object schema including an identifier field", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Object schema including a union field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.required([schemaFactory.number, schemaFactory.string]),
		}) {}

		it("getSimpleSchema", () => {
			// Must enable copy so deep equality passes.
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
					persistedMetadata: undefined,
					simpleAllowedTypes: new Map([["test.object", { isStaged: false }]]),
				},
				definitions: new Map<string, SimpleNodeSchema>([
					[
						"test.object",
						{
							kind: NodeKind.Object,
							metadata: { custom: undefined, description: undefined },
							persistedMetadata: undefined,
							allowUnknownOptionalFields: false,
							fields: new Map([
								[
									"foo",
									{
										kind: FieldKind.Required,
										metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Object schema including a union field", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("Recursive object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.objectRecursive("recursive-object", {
			foo: schemaFactory.optionalRecursive([schemaFactory.string, () => Schema]),
		}) {}

		it("getSimpleSchema", () => {
			const actual = getSimpleSchema(Schema);

			const expected: SimpleTreeSchema = {
				root: {
					kind: FieldKind.Required,
					metadata: { custom: undefined, description: undefined },
					persistedMetadata: undefined,
					simpleAllowedTypes: new Map([["test.recursive-object", { isStaged: false }]]),
				},
				definitions: new Map<string, SimpleNodeSchema>([
					[
						"test.recursive-object",
						{
							kind: NodeKind.Object,
							metadata: { custom: undefined, description: undefined },
							persistedMetadata: undefined,
							allowUnknownOptionalFields: false,
							fields: new Map([
								[
									"foo",
									{
										kind: FieldKind.Optional,
										metadata: { custom: undefined, description: undefined },
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
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(Schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - Recursive object schema", () => {
			const simpleTree = createTreeSchema(Schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
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

			const actual = createTreeSchema(schema);
			assert.deepEqual(actual.root.simpleAllowedTypes, expected.root.simpleAllowedTypes);
		});

		it("serialized - simpleAllowedTypes", () => {
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - simpleAllowedTypes", () => {
			const simpleTree = createTreeSchema(schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
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
					metadata: { custom: undefined, description: undefined },
					persistedMetadata: undefined,
				},
				definitions: new Map([
					[
						"test.hasUnknownOptionalFields",
						{
							kind: NodeKind.Object,
							metadata: { custom: undefined, description: undefined },
							persistedMetadata: undefined,
							allowUnknownOptionalFields: true,
							fields: new Map([]),
						},
					],
				]),
			};

			const actual = getSimpleSchema(schema);
			assert.deepEqual(actual, expected);
		});

		it("serialized - allowUnknownOptionalFields", () => {
			const actual = encodeSchemaCompatibilitySnapshot(createTreeSchema(schema));
			takeJsonSnapshot(actual);
		});

		it("Roundtrip serialization - allowUnknownOptionalFields", () => {
			const simpleTree = createTreeSchema(schema);
			const expected = copySimpleTreeSchemaWithoutMetadata(simpleTree);
			const actual = decodeSchemaCompatibilitySnapshot(
				encodeSchemaCompatibilitySnapshot(simpleTree),
				formatValidator,
			);
			assert.deepEqual(actual, expected);
		});
	});
});
