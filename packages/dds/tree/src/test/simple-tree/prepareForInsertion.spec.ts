/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { hydrate } from "./utils.js";
import { SchemaFactory, TreeArrayNode } from "../../simple-tree/index.js";

// proxies.spec.ts has a lot of coverage for this code, but is focused on other things, and more integration test oriented.
// Here are a few key tests for prepareForInsertion covering cases which are known to be likely to have issues.

// Note that test utility `hydrate` as well as all insert APIs call `prepareForInsertion` internally.

const factory = new SchemaFactory("test");

describe("prepareForInsertion", () => {
	it("multiple top level objects", () => {
		class Obj extends factory.object("Obj", {}) {}
		class A extends factory.array("testA", Obj) {}
		const a = new Obj({});
		const b = new Obj({});
		const root = hydrate(A, []);
		root.insertAtStart(TreeArrayNode.spread([a, b]));
		// Check that the inserted and read proxies are the same object
		assert.equal(a, root[0]);
		assert.equal(b, root[1]);
	});

	it("nested objects", () => {
		class Obj extends factory.object("Obj", {}) {}
		class Parent extends factory.object("Parent", { child: Obj }) {}

		// Under literal
		{
			const child = new Obj({});
			const root = hydrate(Parent, { child });
			assert.equal(child, root.child);
		}

		// Under TreeNode
		{
			const child = new Obj({});
			const parent = new Parent({ child });
			const root = hydrate(Parent, parent);
			assert.equal(parent, root);
			assert.equal(child, root.child);
		}
	});

	it("nested objects at non zero index", () => {
		class A extends factory.arrayRecursive("testA", [() => A]) {}
		const deep1 = new A();
		const deep2 = new A();

		const root = hydrate(A, new A([deep1, deep2]));

		assert.equal(deep1, root[0]);
		assert.equal(deep2, root[1]);
	});
});
