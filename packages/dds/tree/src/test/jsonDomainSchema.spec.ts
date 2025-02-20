/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Tree, TreeAlpha } from "../shared-tree/index.js";
import { JsonArray, JsonObject, JsonUnion } from "../jsonDomainSchema.js";

describe("JsonDomainSchema", () => {
	it("examples", () => {
		const tree1 = TreeAlpha.importConcise(JsonUnion, { example: { nested: true }, value: 5 });

		const tree3 = TreeAlpha.importConcise(JsonArray, [1, "x", { a: 0 }]);

		{
			// Due to TypeScript restrictions on recursive types, the constructor and be somewhat limiting.
			const fromArray = new JsonObject([["a", 0]]);
			// Using `importConcise` can work better for JSON data:
			const imported = TreeAlpha.importConcise(JsonObject, { a: 0 });
			// Node API is like a Map:
			const value = imported.get("a");
			assert.equal(value, 0);
		}

		{
			// Due to TypeScript restrictions on recursive types, the constructor and be somewhat limiting.
			const usingConstructor = new JsonArray(["a", 0, new JsonArray([1])]);
			// Using `importConcise` can work better for JSON data:
			const imported = TreeAlpha.importConcise(JsonArray, ["a", 0, [1]]);
			// Node API is like an Array:
			const outer: JsonUnion = imported[0];
			assert(Tree.is(outer, JsonArray));
			const inner = outer[0];
			assert.equal(inner, 1);
		}
	});
});
