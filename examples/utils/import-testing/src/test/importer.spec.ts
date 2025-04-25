/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { JsonAsTree, SchemaFactoryAlpha, TableSchema } from "@fluidframework/tree/internal";
import type {
	areSafelyAssignable,
	requireTrue,
	requireAssignableTo,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import { BadArraySelf, GoodArraySelf, RecursiveMap } from "../testExports.js";

describe("import tests", () => {
	it("recursive map", () => {
		const r = new RecursiveMap([["", new RecursiveMap([])]]);
		assert.equal(r.size, 1);
	});

	it("JsonArray", () => {
		const r = new JsonAsTree.Array([1]);
		assert.equal(r[0], 1);
	});

	describe("TableSchema", () => {
		// TODO: Add tests for other TableSchema factory functions as they are stabilized.

		it("Column schema", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");

			class Column extends TableSchema.createColumn(
				schemaFactory,
				// TODO: use overload that does not require props
				schemaFactory.null,
			) {}
			const column = new Column({
				// eslint-disable-next-line unicorn/no-null
				props: null,
			});
			// eslint-disable-next-line unicorn/no-null
			assert.equal(column.props, null);
		});

		it("Row schema", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");

			class Cell extends schemaFactory.object("Cell", {
				value: schemaFactory.number,
			}) {}
			class Row extends TableSchema.createRow(
				schemaFactory,
				Cell,
				// TODO: use overload that does not require props
				schemaFactory.null,
			) {}
			const row = new Row({
				cells: {},
				// eslint-disable-next-line unicorn/no-null
				props: null,
			});
			// eslint-disable-next-line unicorn/no-null
			assert.equal(row.props, null);
		});
	});

	// See also the unit tests for JsonAsTree in tree's jsonDomainSchema.spec.ts
	it("Iterator types", () => {
		type ImportedArrayNodeIterator = ReturnType<JsonAsTree.Array[typeof Symbol.iterator]>;
		type ImportedObjectNodeIterator = ReturnType<
			JsonAsTree.JsonObject[typeof Symbol.iterator]
		>;

		type ArrayIterator = ReturnType<
			(readonly (
				| string
				| number
				| boolean
				| JsonAsTree.JsonObject
				| JsonAsTree.Array
				| null
			)[])[typeof Symbol.iterator]
		>;

		type ObjectIterator = IterableIterator<
			[string, string | number | boolean | JsonAsTree.JsonObject | JsonAsTree.Array | null]
		>;

		type _checkArray = requireTrue<
			areSafelyAssignable<ImportedArrayNodeIterator, ArrayIterator>
		>;

		type _checkObject = requireTrue<
			areSafelyAssignable<ImportedObjectNodeIterator, ObjectIterator>
		>;
	});

	it("BadArraySelf", () => {
		const b = new BadArraySelf([new BadArraySelf([new BadArraySelf([])])]);
		const inner = b[0] ?? assert.fail();
		const inner2 = inner[0];
		type B = typeof b;
		type Inner = typeof inner;
		type Inner2 = typeof inner2;
		type _check1 = requireAssignableTo<undefined, Inner2>;
		// This undesired assignment is permitted due to schema aware types being mangled by `any` from d.ts file. See note on BadArraySelf.
		// Intellisense thinks this is an error since its not using the d.ts files and instead using the actual source which has correct typing.
		type _check2 = requireAssignableTo<number, Inner2>;
	});

	it("GoodArraySelf", () => {
		const b = new GoodArraySelf([new GoodArraySelf([new GoodArraySelf([])])]);
		const inner = b[0] ?? assert.fail();
		const inner2 = inner[0];
		type B = typeof b;
		type Inner = typeof inner;
		type Inner2 = typeof inner2;
		type _check1 = requireAssignableTo<undefined, Inner2>;
		// @ts-expect-error This fails, like it should, due to working schema aware types
		type _check2 = requireAssignableTo<number, Inner2>;
	});
});
