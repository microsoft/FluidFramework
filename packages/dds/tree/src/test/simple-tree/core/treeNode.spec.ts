/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	TreeNode,
	inPrototypeChain,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/core/treeNode.js";

import {
	typeNameSymbol,
	typeSchemaSymbol,
	type TreeNodeSchema,
	SchemaFactory,
} from "../../../simple-tree/index.js";
import { validateUsageError } from "../../utils.js";
import { Tree } from "../../../shared-tree/index.js";

describe("simple-tree core types", () => {
	describe("TreeNode", () => {
		it("Assignability", () => {
			// @ts-expect-error TreeNode should not allow non-node objects.
			const n: TreeNode = {};
			// @ts-expect-error TreeNode should not allow non-node objects.
			const n2: TreeNode = {
				[typeNameSymbol]: "",
			};

			// Declared as a separate implicitly typed variable to avoid "Object literal may only specify known properties" error
			// (which is good, but not what we are testing for here).
			const n3 = {
				[typeNameSymbol]: "",
				"#brand": undefined,
			};
			// @ts-expect-error TreeNode should not allow non-node objects, even if you use "add missing properties" refactor.
			const _n4: TreeNode = n3;
		});

		it("subclassing", () => {
			class Subclass extends TreeNode {
				public override get [typeNameSymbol](): string {
					throw new Error("Method not implemented.");
				}
				public override get [typeSchemaSymbol](): never {
					throw new Error("Method not implemented.");
				}
				public constructor() {
					super({});
				}
			}

			// Instances are rejected
			assert.throws(
				() => new Subclass(),
				validateUsageError("TreeNodes must extend schema classes created by SchemaFactory"),
			);

			// Use as schema is rejected
			assert.throws(
				() => {
					Tree.is(0, Subclass as unknown as TreeNodeSchema);
				},
				validateUsageError(/does not extend a SchemaFactory generated class/),
			);
		});

		it("instanceof", () => {
			const factory = new SchemaFactory("Test");
			class Customizable extends factory.object("o", {}) {}
			const Pojo = factory.array([]);
			assert.equal({} instanceof TreeNode, false);
			assert.equal(new Customizable({}) instanceof TreeNode, true);
			assert.equal(Pojo.create() instanceof TreeNode, true);
			assert.equal([] instanceof TreeNode, false);
		});
	});

	describe("inPrototypeChain", () => {
		it("self", () => {
			const test = {};
			assert(inPrototypeChain(test, test));
		});

		it("class inheritance", () => {
			// eslint-disable-next-line @typescript-eslint/no-extraneous-class
			class A {}
			class B extends A {}
			assert(inPrototypeChain(B.prototype, A.prototype));
			assert.equal(inPrototypeChain(A.prototype, B.prototype), false);

			// Static inheritance
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			assert(inPrototypeChain(Reflect.getPrototypeOf(B), Reflect.getPrototypeOf(A)!));
			assert.equal(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				inPrototypeChain(Reflect.getPrototypeOf(A), Reflect.getPrototypeOf(B)!),
				false,
			);
		});
	});
});
