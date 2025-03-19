/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Tree, TreeAlpha } from "../shared-tree/index.js";
import { JsonAsTree } from "../jsonDomainSchema.js";
import type { areSafelyAssignable, requireTrue } from "../util/index.js";

describe("JsonDomainSchema", () => {
	it("examples", () => {
		const tree1 = TreeAlpha.importConcise(JsonAsTree.Tree, {
			example: { nested: true },
			value: 5,
		});

		const tree3 = TreeAlpha.importConcise(JsonAsTree.Array, [1, "x", { a: 0 }]);

		{
			// Due to TypeScript restrictions on recursive types, the constructor and be somewhat limiting.
			const fromArray = new JsonAsTree.JsonObject([["a", 0]]);
			// Using `importConcise` can work better for JSON data:
			const imported = TreeAlpha.importConcise(JsonAsTree.JsonObject, { a: 0 });
			// Node API is like a Map:
			const value = imported.get("a");
			assert.equal(value, 0);
		}

		{
			// Due to TypeScript restrictions on recursive types, the constructor and be somewhat limiting.
			const usingConstructor = new JsonAsTree.Array(["a", 0, new JsonAsTree.Array([1])]);
			// Using `importConcise` can work better for JSON data:
			const imported = TreeAlpha.importConcise(JsonAsTree.Array, ["a", 0, [1]]);
			assert(Tree.is(imported, JsonAsTree.Array));
			// Node API is like an Array:
			const inner: JsonAsTree.Tree = imported[2];
			assert(Tree.is(inner, JsonAsTree.Array));
			assert.deepEqual([...inner], [1]);
		}
	});

	// Compile-time testing for some of the types generated as part of this Domain.
	// It has exhibited some compilation nondeterminism, as well as some more generally odd behavior:
	// these tests should help ensure that the types are actually working properly despite these issues,
	// as well as provide a starting place for attempts to further investigate and debug related problems.
	// This particular domain is showing typing oddities related to
	// its recursive nature and the likely related occasional different ordering of unions in the iterators after incremental builds
	// as well as the inlining of boolean schema failing to get simplified in the .d.ts file.
	it("generated TypeScript type validation", () => {
		// Intellisense shows the JsonObject iterator type like this, which is the desired behavior:
		type ExpectedJsonObjectIterator = IterableIterator<
			[string, string | number | boolean | JsonAsTree.JsonObject | JsonAsTree.Array | null]
		>;
		// Unfortunately the type shows up in a more complicated way in the .d.ts file and API reports.
		// This test ensures that the type is actually working as expected despite this:
		type JsonObjectIterator = ReturnType<JsonAsTree.JsonObject[typeof Symbol.iterator]>;

		type _checkObjectIterator = requireTrue<
			areSafelyAssignable<JsonObjectIterator, ExpectedJsonObjectIterator>
		>;

		// Due to the nature of this issue possibly being impacted by details of the .d.ts generation,
		// there is also some testing in examples/utils/import-testing/src/test/importer.spec.ts
		// which ensures it works from outside the package with both CJS and ESM.
	});
});
