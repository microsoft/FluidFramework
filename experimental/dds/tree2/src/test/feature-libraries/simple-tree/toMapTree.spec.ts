/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { toMapTree } from "../../../feature-libraries/simple-tree/toMapTree";
import { SchemaBuilder, leaf } from "../../../domains";
import { brand } from "../../../util";
import { EmptyKey, FieldKey, type MapTree } from "../../../core";

// Note: the behaviors here are more heavily tested by `proxies.spec.ts`.
// This adds some basic unit test for the generated cursor adapter, but since the adapter is an implementation
// detail of the proxy API, deep coverage at this level was not prioritized.
describe.only("toMapTree", () => {
	it("string", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const schema = schemaBuilder.intoSchema(schemaBuilder.string);

		const tree = "Hello world";

		const actual = toMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: leaf.string.name,
			value: "Hello world",
			fields: new Map(),
		};

		assert.deepEqual(actual, expected);
	});

	it("list", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.list("list", [schemaBuilder.number]);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const tree = [42, 37, -1];

		const actual = toMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.list"),
			fields: new Map<FieldKey, MapTree[]>([
				[
					EmptyKey,
					[
						{ type: leaf.number.name, value: 42, fields: new Map() },
						{ type: leaf.number.name, value: 37, fields: new Map() },
						{ type: leaf.number.name, value: -1, fields: new Map() },
					],
				],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("map", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.map("map", [
			schemaBuilder.number,
			schemaBuilder.string,
			schemaBuilder.boolean,
		]);
		const schema = schemaBuilder.intoSchema(rootSchema);

		const entries: [string, boolean | number | string | undefined][] = [
			["a", 42],
			["b", "Hello world"],
			["c", false],
			["d", undefined], // Should be skipped in output
		];
		const tree = new Map<string, boolean | number | string | undefined>(entries);

		const actual = toMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.map"),
			fields: new Map<FieldKey, MapTree[]>([
				[brand("a"), [{ type: leaf.number.name, value: 42, fields: new Map() }]],
				[brand("b"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
				[brand("c"), [{ type: leaf.boolean.name, value: false, fields: new Map() }]],
			]),
		};

		assert.deepEqual(actual, expected);
	});

	it("complex", () => {
		const schemaBuilder = new SchemaBuilder({ scope: "test" });
		const rootSchema = schemaBuilder.object("object", {
			a: schemaBuilder.string,
			b: schemaBuilder.list(schemaBuilder.number),
			c: schemaBuilder.map([schemaBuilder.string, schemaBuilder.number]),
			d: schemaBuilder.optional(schemaBuilder.number),
		});
		const schema = schemaBuilder.intoSchema(rootSchema);

		const a = "Hello world";
		const b = [42, 37, -1];
		const cEntries: [string, string | number][] = [
			["foo", 0],
			["bar", "1"],
			["baz", 2],
		];
		const c = new Map<string, number | string>(cEntries);

		const tree = {
			a,
			b,
			c,
			d: undefined,
		};

		const actual = toMapTree(tree, { schema }, schema.rootFieldSchema.types);

		const expected: MapTree = {
			type: brand("test.object"),
			fields: new Map<FieldKey, MapTree[]>([
				[brand("a"), [{ type: leaf.string.name, value: "Hello world", fields: new Map() }]],
				[
					brand("b"),
					[
						{
							type: brand('test.List<["com.fluidframework.leaf.number"]>'),
							fields: new Map<FieldKey, MapTree[]>([
								[
									EmptyKey,
									[
										{ type: leaf.number.name, value: 42, fields: new Map() },
										{ type: leaf.number.name, value: 37, fields: new Map() },
										{ type: leaf.number.name, value: -1, fields: new Map() },
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
							type: brand(
								'test.Map<["com.fluidframework.leaf.number","com.fluidframework.leaf.string"]>',
							),
							fields: new Map<FieldKey, MapTree[]>([
								[
									brand("foo"),
									[{ type: leaf.number.name, value: 0, fields: new Map() }],
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
