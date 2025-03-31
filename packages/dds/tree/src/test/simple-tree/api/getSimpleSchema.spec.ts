/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	FieldKind,
	getSimpleSchema,
	NodeKind,
	SchemaFactory,
	type SimpleLeafNodeSchema,
	type SimpleNodeSchema,
	type SimpleObjectFieldSchema,
	type SimpleObjectNodeSchema,
	type SimpleTreeSchema,
} from "../../../simple-tree/index.js";
import { ValueSchema } from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toSimpleTreeSchema } from "../../../simple-tree/api/viewSchemaToSimpleSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { schemaStatics } from "../../../simple-tree/api/schemaFactory.js";

const simpleString: SimpleLeafNodeSchema = {
	leafKind: ValueSchema.String,
	kind: NodeKind.Leaf,
	metadata: {},
};

const simpleNumber: SimpleLeafNodeSchema = {
	leafKind: ValueSchema.Number,
	kind: NodeKind.Leaf,
	metadata: {},
};

describe("getSimpleSchema", () => {
	it("non-copying", () => {
		const Schema = schemaStatics.string;

		const actual = toSimpleTreeSchema(Schema, false);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			metadata: {},
			definitions: new Map([[Schema.identifier, Schema]]),
			allowedTypesIdentifiers: new Set([Schema.identifier]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Field Schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.optional(schemaFactory.string, {
			metadata: { description: "An optional string." },
		});

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Optional,
			definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
			metadata: { description: "An optional string." },
			allowedTypesIdentifiers: new Set(["com.fluidframework.leaf.string"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Leaf node", () => {
		const Schema = SchemaFactory.string;

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			metadata: {},
			definitions: new Map([["com.fluidframework.leaf.string", simpleString]]),
			allowedTypesIdentifiers: new Set(["com.fluidframework.leaf.string"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Union root", () => {
		const Schema = [SchemaFactory.number, SchemaFactory.string];

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			metadata: {},
			definitions: new Map([
				["com.fluidframework.leaf.number", simpleNumber],
				["com.fluidframework.leaf.string", simpleString],
			]),
			allowedTypesIdentifiers: new Set([
				"com.fluidframework.leaf.number",
				"com.fluidframework.leaf.string",
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.array("array", schemaFactory.string) {}

		const actual = toSimpleTreeSchema(Schema, true);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			metadata: {},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.array",
					{
						kind: NodeKind.Array,
						allowedTypesIdentifiers: new Set(["com.fluidframework.leaf.string"]),
						metadata: {},
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
			allowedTypesIdentifiers: new Set(["test.array"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.map("map", schemaFactory.string) {}

		const actual = toSimpleTreeSchema(Schema, true);
		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			metadata: {},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.map",
					{
						kind: NodeKind.Map,
						metadata: {},
						allowedTypesIdentifiers: new Set(["com.fluidframework.leaf.string"]),
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
			allowedTypesIdentifiers: new Set(["test.map"]),
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
			kind: FieldKind.Required,
			metadata: {},
			definitions: new Map<string, SimpleNodeSchema>([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						metadata: {},
						fields: new Map<string, SimpleObjectFieldSchema>([
							[
								"foo",
								{
									kind: FieldKind.Optional,
									metadata: {},
									allowedTypesIdentifiers: new Set(["com.fluidframework.leaf.number"]),
									storedKey: "foo",
								},
							],
							[
								"bar",
								{
									kind: FieldKind.Required,
									metadata: {},
									allowedTypesIdentifiers: new Set(["com.fluidframework.leaf.string"]),
									storedKey: "bar",
								},
							],
						]),
					} satisfies SimpleObjectNodeSchema,
				],
				["com.fluidframework.leaf.number", simpleNumber],
				["com.fluidframework.leaf.string", simpleString],
			]),
			allowedTypesIdentifiers: new Set(["test.object"]),
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
			kind: FieldKind.Required,
			metadata: {},
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
									metadata: {},
									allowedTypesIdentifiers: new Set(["com.fluidframework.leaf.string"]),
									storedKey: "id",
								},
							],
						]),
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
			allowedTypesIdentifiers: new Set(["test.object"]),
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
			kind: FieldKind.Required,
			metadata: {},
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
									allowedTypesIdentifiers: new Set([
										"com.fluidframework.leaf.number",
										"com.fluidframework.leaf.string",
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
			allowedTypesIdentifiers: new Set(["test.object"]),
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
			kind: FieldKind.Required,
			metadata: {},
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
									allowedTypesIdentifiers: new Set([
										"com.fluidframework.leaf.string",
										"test.recursive-object",
									]),
									storedKey: "foo",
								},
							],
						]),
					},
				],
				["com.fluidframework.leaf.string", simpleString],
			]),
			allowedTypesIdentifiers: new Set(["test.recursive-object"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Simple Schema cached", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.string;

		const firstQuery = getSimpleSchema(Schema);
		const secondQuery = getSimpleSchema(Schema);

		// Object equality to ensure the same object is returned by subsequent calls.
		return assert.equal(firstQuery, secondQuery);
	});
});
