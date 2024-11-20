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
	type SimpleTreeSchema,
} from "../../../simple-tree/index.js";
import { ValueSchema } from "../../../core/index.js";

describe("getSimpleSchema", () => {
	it("Field Schema", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.optional(schemaFactory.string, {
			metadata: { description: "An optional string." },
		});

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Optional,
			definitions: new Map([
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			metadata: { description: "An optional string." },
			allowedTypes: new Set(["com.fluidframework.leaf.string"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Leaf node", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.string;

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set(["com.fluidframework.leaf.string"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Union root", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = [schemaFactory.number, schemaFactory.string];

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"com.fluidframework.leaf.number",
					{
						leafKind: ValueSchema.Number,
						kind: NodeKind.Leaf,
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set([
				"com.fluidframework.leaf.number",
				"com.fluidframework.leaf.string",
			]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Array schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.array("array", schemaFactory.string) {}

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"test.array",
					{
						kind: NodeKind.Array,
						allowedTypes: new Set(["com.fluidframework.leaf.string"]),
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set(["test.array"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Map schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.map("map", schemaFactory.string) {}

		const actual = getSimpleSchema(Schema);
		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"test.map",
					{
						kind: NodeKind.Map,
						allowedTypes: new Set(["com.fluidframework.leaf.string"]),
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set(["test.map"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.optional(schemaFactory.number),
			bar: schemaFactory.required(schemaFactory.string),
		}) {}

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						fields: {
							foo: {
								kind: FieldKind.Optional,
								allowedTypes: new Set(["com.fluidframework.leaf.number"]),
							},
							bar: {
								kind: FieldKind.Required,
								allowedTypes: new Set(["com.fluidframework.leaf.string"]),
							},
						},
					},
				],
				[
					"com.fluidframework.leaf.number",
					{
						leafKind: ValueSchema.Number,
						kind: NodeKind.Leaf,
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set(["test.object"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema including an identifier field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			id: schemaFactory.identifier,
		}) {}

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						fields: {
							id: {
								kind: FieldKind.Identifier,
								allowedTypes: new Set(["com.fluidframework.leaf.string"]),
							},
						},
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set(["test.object"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Object schema including a union field", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.object("object", {
			foo: schemaFactory.required([schemaFactory.number, schemaFactory.string]),
		}) {}

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"test.object",
					{
						kind: NodeKind.Object,
						fields: {
							foo: {
								kind: FieldKind.Required,
								allowedTypes: new Set([
									"com.fluidframework.leaf.number",
									"com.fluidframework.leaf.string",
								]),
							},
						},
					},
				],
				[
					"com.fluidframework.leaf.number",
					{
						leafKind: ValueSchema.Number,
						kind: NodeKind.Leaf,
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set(["test.object"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Recursive object schema", () => {
		const schemaFactory = new SchemaFactory("test");
		class Schema extends schemaFactory.objectRecursive("recursive-object", {
			foo: schemaFactory.optionalRecursive([schemaFactory.string, () => Schema]),
		}) {}

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			kind: FieldKind.Required,
			definitions: new Map([
				[
					"test.recursive-object",
					{
						kind: NodeKind.Object,
						fields: {
							foo: {
								kind: FieldKind.Optional,
								allowedTypes: new Set([
									"com.fluidframework.leaf.string",
									"test.recursive-object",
								]),
							},
						},
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: ValueSchema.String,
						kind: NodeKind.Leaf,
					},
				],
			]),
			allowedTypes: new Set(["test.recursive-object"]),
		};
		assert.deepEqual(actual, expected);
	});

	it("Simple Schema cached on node schema", () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.string;

		const firstQuery = getSimpleSchema(Schema);
		const secondQuery = getSimpleSchema(Schema);

		// Object equality to ensure the same object is returned by subsequent calls.
		return assert.equal(firstQuery, secondQuery);
	});
});
