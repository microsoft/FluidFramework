/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	getSimpleSchema,
	SchemaFactory,
	type SimpleTreeSchema,
} from "../../simple-tree/index.js";

describe("getSimpleSchema", () => {
	it("Leaf node", async () => {
		const schemaFactory = new SchemaFactory("test");
		const Schema = schemaFactory.string;

		const actual = getSimpleSchema(Schema);

		const expected: SimpleTreeSchema = {
			definitions: new Map([
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: "string",
						kind: "leaf",
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
			definitions: new Map([
				[
					"com.fluidframework.leaf.number",
					{
						leafKind: "number",
						kind: "leaf",
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: "string",
						kind: "leaf",
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
			definitions: new Map([
				[
					"test.array",
					{
						kind: "array",
						allowedTypes: new Set(["com.fluidframework.leaf.string"]),
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: "string",
						kind: "leaf",
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
			definitions: new Map([
				[
					"test.map",
					{
						kind: "map",
						allowedTypes: new Set(["com.fluidframework.leaf.string"]),
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: "string",
						kind: "leaf",
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
			definitions: new Map([
				[
					"test.object",
					{
						kind: "object",
						fields: {
							foo: {
								kind: "optional",
								allowedTypes: new Set(["com.fluidframework.leaf.number"]),
							},
							bar: {
								kind: "required",
								allowedTypes: new Set(["com.fluidframework.leaf.string"]),
							},
						},
					},
				],
				[
					"com.fluidframework.leaf.number",
					{
						leafKind: "number",
						kind: "leaf",
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: "string",
						kind: "leaf",
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
			definitions: new Map([
				[
					"test.object",
					{
						kind: "object",
						fields: {
							id: {
								kind: "identifier",
								allowedTypes: new Set(["com.fluidframework.leaf.string"]),
							},
						},
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: "string",
						kind: "leaf",
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
			definitions: new Map([
				[
					"test.object",
					{
						kind: "object",
						fields: {
							foo: {
								kind: "required",
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
						leafKind: "number",
						kind: "leaf",
					},
				],
				[
					"com.fluidframework.leaf.string",
					{
						leafKind: "string",
						kind: "leaf",
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
			definitions: new Map([
				[
					"test.recursive-object",
					{
						kind: "object",
						fields: {
							foo: {
								kind: "optional",
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
						leafKind: "string",
						kind: "leaf",
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
