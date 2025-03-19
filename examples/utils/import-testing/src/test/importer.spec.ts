/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { JsonAsTree } from "@fluidframework/tree/alpha";
// eslint-disable-next-line import/no-internal-modules
import type { areSafelyAssignable, requireTrue } from "@fluidframework/tree/internal";

import { RecursiveMap } from "../testExports.js";

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
});
