/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Tree, TreeAlpha } from "../shared-tree/index.js";
import { JsonAsTree } from "../jsonDomainSchema.js";

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
});
