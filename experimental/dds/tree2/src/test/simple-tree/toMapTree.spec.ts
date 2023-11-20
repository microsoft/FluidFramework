/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MockHandle } from "@fluidframework/test-runtime-utils";

import { EmptyKey, type FieldKey, type MapTree } from "../../core";
import { SchemaBuilder, leaf } from "../../domains";
// eslint-disable-next-line import/no-internal-modules
import { nodeDataToMapTree } from "../../simple-tree/toMapTree";
import { brand } from "../../util";

describe("toMapTree", () => {
	it("string", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const schema = schemaBuilder.intoSchema(schemaBuilder.string);

		const tree = "Hello world";

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: leaf.string.name,
			value: "Hello world",
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("null", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const schema = schemaBuilder.intoSchema(schemaBuilder.null);

		const actual = nodeDataToMapTree(null, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: leaf.null.name,
			value: null,
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("handle", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const schema = schemaBuilder.intoSchema(schemaBuilder.handle);

		const tree = new MockHandle<string>("mock-fluid-handle");

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: leaf.handle.name,
			value: tree,
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("list (non-empty)", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.list("list", [schemaBuilder.number, schemaBuilder.handle]);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const handle = new MockHandle<boolean>(true);
		const tree = [42, handle, 37];

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.list"),
			fields: new Map<FieldKey, MapTree[]>([
				[
					EmptyKey,
					[
						{ type: leaf.number.name, value: 42, fields: new Map() },
						{ type: leaf.handle.name, value: handle, fields: new Map() },
						{ type: leaf.number.name, value: 37, fields: new Map() },
					],
				],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("list (empty)", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.list("list", schemaBuilder.number);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const tree: number[] = [];

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.list"),
			fields: new Map<FieldKey, MapTree[]>(),
		};

		assert.deepEqual(actual, expected);
	});

	it("map (non-empty)", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.map("map", [
			schemaBuilder.number,
			schemaBuilder.string,
			schemaBuilder.null,
		]);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const entries: [string, number | string | null | undefined][] = [
			["a", 42],
			["b", "Hello world"],
			["c", null],
			["d", undefined], // Should be skipped in output
		];
		const tree = new Map<string, number | string | null | undefined>(entries);

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.map"),
			fields: new Map<FieldKey, MapTree[]>([
				[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
				[brand("b"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
				[brand("c"), [{ type: leaf.null.name, value: null, fields: new Map() }]],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("map (empty)", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.map("map", [schemaBuilder.number]);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const tree = new Map<string, number>();

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.map"),
			fields: new Map<FieldKey, MapTree[]>(),
		};

		assert.deepEqual(actual, expected);
	});

	it("object (non-empty)", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.object("object", {
			a: schemaBuilder.string,
			b: schemaBuilder.number,
			c: schemaBuilder.boolean,
			d: schemaBuilder.optional(schemaBuilder.number),
		});
		const schema = schemaBuilder.intoSchema(rootSchema);

		const tree = {
			a: "Hello world",
			b: 42,
			c: false,
			d: undefined, // Should be skipped in output
		};

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.object"),
			fields: new Map<FieldKey, MapTree[]>([
				[brand("a"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
				[brand("b"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
				[brand("c"), [{ type: leaf.boolean.name, value: false, fields: new Map() }]],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("object (empty)", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.object("object", {
			a: schemaBuilder.optional(schemaBuilder.number),
		});
		const schema = schemaBuilder.intoSchema(rootSchema);

		const tree = {};

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.object"),
			fields: new Map<FieldKey, MapTree[]>(),
		};

		assert.deepEqual(actual, expected);
	});

	it("complex", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const childObjectSchema = schemaBuilder.object("child-object", {
			name: schemaBuilder.string,
			age: schemaBuilder.number,
		});
		const rootSchema = schemaBuilder.object("complex-object", {
			a: schemaBuilder.string,
			b: schemaBuilder.list("list", [
				childObjectSchema,
				schemaBuilder.handle,
				schemaBuilder.null,
			]),
			c: schemaBuilder.map("map", [
				childObjectSchema,
				schemaBuilder.string,
				schemaBuilder.number,
			]),
		});
		const schema = schemaBuilder.intoSchema(rootSchema);

		const handle = new MockHandle<boolean>(true);

		const a = "Hello world";
		const b = [{ name: "Jack", age: 37 }, null, { name: "Jill", age: 42 }, handle];
		const cEntries: [string, unknown][] = [
			["foo", { name: "Foo", age: 2 }],
			["bar", "1"],
			["baz", 2],
		];
		const c = new Map<string, unknown>(cEntries);

		const tree = {
			a,
			b,
			c,
		};

		const actual = nodeDataToMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.complex-object"),
			fields: new Map<FieldKey, MapTree[]>([
				[brand("a"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
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
											type: childObjectSchema.name,
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: leaf.string.name,
															value: "Jack",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: leaf.number.name,
															value: 37,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{ type: leaf.null.name, value: null, fields: new Map() },
										{
											type: childObjectSchema.name,
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: leaf.string.name,
															value: "Jill",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: leaf.number.name,
															value: 42,
															fields: new Map(),
														},
													],
												],
											]),
										},
										{
											type: leaf.handle.name,
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
											type: childObjectSchema.name,
											fields: new Map<FieldKey, MapTree[]>([
												[
													brand("name"),
													[
														{
															type: leaf.string.name,
															value: "Foo",
															fields: new Map(),
														},
													],
												],
												[
													brand("age"),
													[
														{
															type: leaf.number.name,
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
									[{ type: leaf.string.name, value: "1", fields: new Map() }],
								],
								[
									brand("baz"),
									[{ type: leaf.number.name, value: 2, fields: new Map() }],
								],
							]),
						},
					],
				],
			]),
		};

		assert.deepEqual(actual, expected);
	});
});
