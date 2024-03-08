/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MockHandle } from "@fluidframework/test-runtime-utils";

import {
	EmptyKey,
	type FieldKey,
	type MapTree,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";

import {
	SchemaFactory,
	booleanSchema,
	handleSchema,
	numberSchema,
	nullSchema,
	stringSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaFactory.js";
// eslint-disable-next-line import/no-internal-modules
import { nodeDataToMapTree } from "../../simple-tree/toMapTree.js";
import { brand } from "../../util/index.js";
// import { FieldKinds, SchemaBuilderBase } from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { InsertableContent } from "../../simple-tree/proxies.js";

const booleanSchemaIdentifier: TreeNodeSchemaIdentifier = brand(booleanSchema.identifier);
const handleSchemaIdentifier: TreeNodeSchemaIdentifier = brand(handleSchema.identifier);
const numberSchemaIdentifier: TreeNodeSchemaIdentifier = brand(numberSchema.identifier);
const nullSchemaIdentifier: TreeNodeSchemaIdentifier = brand(nullSchema.identifier);
const stringSchemaIdentifier: TreeNodeSchemaIdentifier = brand(stringSchema.identifier);

describe("toMapTree", () => {
	it("string", () => {
		const schemaFactory = new SchemaFactory("test");

		const tree = "Hello world";

		const actual = nodeDataToMapTree(tree, [schemaFactory.string]);

		const expected: MapTree = {
			type: stringSchemaIdentifier,
			value: "Hello world",
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("null", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.null;

		const actual = nodeDataToMapTree(null, [schema]);

		const expected: MapTree = {
			type: nullSchemaIdentifier,
			value: null,
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("handle", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.handle;

		const tree = new MockHandle<string>("mock-fluid-handle");

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand(schemaFactory.handle.identifier),
			value: tree,
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("list (non-empty)", () => {
		const schemaFactory = new SchemaFactory("test");
		const childObjectSchema = schemaFactory.object("child-object", {
			name: schemaFactory.string,
			age: schemaFactory.number,
		});
		const schema = schemaFactory.array("list", [
			schemaFactory.number,
			schemaFactory.handle,
			childObjectSchema,
		]);

		const handle = new MockHandle<boolean>(true);
		const tree = [42, handle, { age: 37, name: "Jack" }];

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.list"),
			fields: new Map<FieldKey, MapTree[]>([
				[
					EmptyKey,
					[
						{
							type: numberSchemaIdentifier,
							value: 42,
							fields: new Map(),
						},
						{
							type: handleSchemaIdentifier,
							value: handle,
							fields: new Map(),
						},
						{
							type: brand(childObjectSchema.identifier),
							fields: new Map<FieldKey, MapTree[]>([
								[
									brand("name"),
									[
										{
											type: stringSchemaIdentifier,
											value: "Jack",
											fields: new Map(),
										},
									],
								],
								[
									brand("age"),
									[
										{
											type: numberSchemaIdentifier,
											value: 37,
											fields: new Map(),
										},
									],
								],
							]),
						},
					],
				],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("list (empty)", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.array("list", schemaFactory.number);

		const tree: number[] = [];

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.list"),
			fields: new Map<FieldKey, MapTree[]>(),
		};

		assert.deepEqual(actual, expected);
	});

	it("map (non-empty)", () => {
		const schemaFactory = new SchemaFactory("test");
		const childObjectSchema = schemaFactory.object("child-object", {
			name: schemaFactory.string,
			age: schemaFactory.number,
		});
		const schema = schemaFactory.map("map", [
			childObjectSchema,
			schemaFactory.number,
			schemaFactory.string,
			schemaFactory.null,
		]);

		const entries: [string, InsertableContent][] = [
			["a", 42],
			["b", "Hello world"],
			["c", null],
			["d", undefined as unknown as InsertableContent], // Should be skipped in output
			["e", { age: 37, name: "Jill" }],
		];
		const tree = new Map<string, InsertableContent>(entries);

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.map"),
			fields: new Map<FieldKey, MapTree[]>([
				[brand("a"), [{ type: numberSchemaIdentifier, value: 42, fields: new Map() }]],
				[
					brand("b"),
					[{ type: stringSchemaIdentifier, value: "Hello world", fields: new Map() }],
				],
				[
					brand("c"),
					[{ type: brand(nullSchema.identifier), value: null, fields: new Map() }],
				],
				[
					brand("e"),
					[
						{
							type: brand(childObjectSchema.identifier),
							fields: new Map([
								[
									brand("name"),
									[
										{
											type: stringSchemaIdentifier,
											value: "Jill",
											fields: new Map(),
										},
									],
								],
								[
									brand("age"),
									[
										{
											type: numberSchemaIdentifier,
											value: 37,
											fields: new Map(),
										},
									],
								],
							]),
						},
					],
				],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("map (empty)", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.map("map", [schemaFactory.number]);

		const tree = new Map<string, number>();

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.map"),
			fields: new Map<FieldKey, MapTree[]>(),
		};

		assert.deepEqual(actual, expected);
	});

	it("object (non-empty)", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.object("object", {
			a: schemaFactory.string,
			b: schemaFactory.number,
			c: schemaFactory.boolean,
			d: schemaFactory.optional(schemaFactory.number),
		});

		const tree = {
			a: "Hello world",
			b: 42,
			c: false,
			d: undefined, // Should be skipped in output
		};

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.object"),
			fields: new Map<FieldKey, MapTree[]>([
				[
					brand("a"),
					[{ type: stringSchemaIdentifier, value: "Hello world", fields: new Map() }],
				],
				[brand("b"), [{ type: numberSchemaIdentifier, value: 42, fields: new Map() }]],
				[brand("c"), [{ type: booleanSchemaIdentifier, value: false, fields: new Map() }]],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("object (empty)", () => {
		const schemaFactory = new SchemaFactory("test");
		const schema = schemaFactory.object("object", {
			a: schemaFactory.optional(schemaFactory.number),
		});

		const tree = {};

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.object"),
			fields: new Map<FieldKey, MapTree[]>(),
		};

		assert.deepEqual(actual, expected);
	});

	it("complex", () => {
		const schemaFactory = new SchemaFactory("test");
		const childObjectSchema = schemaFactory.object("child-object", {
			name: schemaFactory.string,
			age: schemaFactory.number,
		});
		const schema = schemaFactory.object("complex-object", {
			a: schemaFactory.string,
			b: schemaFactory.array("list", [
				childObjectSchema,
				schemaFactory.handle,
				schemaFactory.null,
			]),
			c: schemaFactory.map("map", [
				childObjectSchema,
				schemaFactory.string,
				schemaFactory.number,
			]),
		});

		const handle = new MockHandle<boolean>(true);

		const a = "Hello world";
		const b = [{ name: "Jack", age: 37 }, null, { name: "Jill", age: 42 }, handle];
		const cEntries: [string, InsertableContent][] = [
			["foo", { name: "Foo", age: 2 }],
			["bar", "1"],
			["baz", 2],
		];
		const c = new Map<string, InsertableContent>(cEntries);

		const tree = {
			a,
			b,
			c,
		};

		const actual = nodeDataToMapTree(tree, [schema]);

		const expected: MapTree = {
			type: brand("test.complex-object"),
			fields: new Map<FieldKey, MapTree[]>([
				[
					brand("a"),
					[{ type: stringSchemaIdentifier, value: "Hello world", fields: new Map() }],
				],
				[
					brand("b"),
					[
						{
							type: brand("test.list"),
							fields: new Map<FieldKey, MapTree[]>([
								[
									EmptyKey,
									[
										{
											type: brand(childObjectSchema.identifier),
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: stringSchemaIdentifier,
															value: "Jack",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: numberSchemaIdentifier,
															value: 37,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{
											type: nullSchemaIdentifier,
											value: null,
											fields: new Map(),
										},
										{
											type: brand(childObjectSchema.identifier),
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: stringSchemaIdentifier,
															value: "Jill",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: numberSchemaIdentifier,
															value: 42,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{
											type: handleSchemaIdentifier,
											value: handle,
											fields: new Map(),
										},
									],
								],
							]),
						},
					],
				],
				[
					brand("c"),
					[
						{
							type: brand("test.map"),
							fields: new Map<FieldKey, MapTree[]>([
								[
									brand("foo"),
									[
										{
											type: brand(childObjectSchema.identifier),
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: stringSchemaIdentifier,
															value: "Foo",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: numberSchemaIdentifier,
															value: 2,
															fields: new Map(),
														},
													],
												],
											]),
										},
									],
								],
								[
									brand("bar"),
									[
										{
											type: stringSchemaIdentifier,
											value: "1",
											fields: new Map(),
										},
									],
								],
								[
									brand("baz"),
									[{ type: numberSchemaIdentifier, value: 2, fields: new Map() }],
								],
							]),
						},
					],
				],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("ambagious unions", () => {
		const schemaFactory = new SchemaFactory("test");
		const a = schemaFactory.object("a", {});
		const b = schemaFactory.object("b", {});
		const schema = [a, b];

		assert.throws(() => nodeDataToMapTree({}, schema), /\["test.a","test.b"]/);
	});

	// Our data serialization format does not support certain numeric values.
	// These tests are intended to verify the mapping behaviors for those values.
	describe("Incompatible numeric value handling", () => {
		function assertFallback(value: number, expectedFallbackValue: unknown): void {
			const schemaFactory = new SchemaFactory("test");

			// The current fallbacks we generate are `number` and `null`.
			// This list will need to be expanded if that set changes and we wish to test the associated scenarios.
			const schema = [schemaFactory.number, schemaFactory.null];

			const result = nodeDataToMapTree(value, schema);
			assert.equal(result.value, expectedFallbackValue);
		}

		function assertValueThrows(value: number): void {
			const schemaFactory = new SchemaFactory("test");

			// Schema doesn't support null, so numeric values that fall back to null should throw
			const schema = schemaFactory.number;
			assert.throws(() => nodeDataToMapTree(value, [schema]));
		}

		it("NaN (falls back to null if allowed by the schema)", () => {
			assertFallback(Number.NaN, null);
		});

		it("NaN (throws if fallback type is not allowed by the schema)", () => {
			assertValueThrows(Number.NaN);
		});

		it("+∞ (throws if fallback type is not allowed by the schema)", () => {
			assertValueThrows(Number.POSITIVE_INFINITY);
		});

		it("+∞ (falls back to null if allowed by the schema)", () => {
			assertFallback(Number.POSITIVE_INFINITY, null);
		});

		it("-∞ (throws if fallback type is not allowed by the schema)", () => {
			assertValueThrows(Number.NEGATIVE_INFINITY);
		});

		it("-∞ (falls back to null if allowed by the schema)", () => {
			assertFallback(Number.NEGATIVE_INFINITY, null);
		});

		// Fallback for -0 is +0, so it is supported in all cases where a number is supported.
		it("-0", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.number;

			const result = nodeDataToMapTree(-0, [schema]);
			assert.equal(result.value, +0);
		});

		it("List containing `undefined` (maps values to null if allowed by the schema)", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.array("test-list", [
				schemaFactory.number,
				schemaFactory.null,
			]);

			const input: (number | undefined)[] = [42, undefined, 37, undefined];

			const actual = nodeDataToMapTree(input as InsertableContent, [schema]);

			const expected: MapTree = {
				type: brand(schema.identifier),
				fields: new Map([
					[
						EmptyKey,
						[
							{
								value: 42,
								type: numberSchemaIdentifier,
								fields: new Map(),
							},
							{
								value: null,
								type: nullSchemaIdentifier,
								fields: new Map(),
							},
							{
								value: 37,
								type: numberSchemaIdentifier,
								fields: new Map(),
							},
							{
								value: null,
								type: nullSchemaIdentifier,
								fields: new Map(),
							},
						],
					],
				]),
			};

			assert.deepEqual(actual, expected);
		});

		it("List containing `undefined` (throws if fallback type is not allowed by the schema)", () => {
			const schemaFactory = new SchemaFactory("test");
			const schema = schemaFactory.array("test-list", [schemaFactory.number]);

			const input: (number | undefined)[] = [42, undefined, 37, undefined];

			assert.throws(() => nodeDataToMapTree(input as InsertableContent, [schema]));
		});
	});
});
