/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { JsonAsTree } from "@fluidframework/tree/alpha";
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
