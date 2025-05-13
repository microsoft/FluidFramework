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
	// Used to test that TreeNode is a type only export.
	TreeNode as TreeNodePublic,
} from "../../../simple-tree/index.js";
import { validateUsageError } from "../../utils.js";

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

			assert.throws(() => new Subclass(), validateUsageError(/SchemaFactory/));
		});

		it("subclassing from public API", () => {
			assert.throws(() => {
				// @ts-expect-error TreeNode is only type exported, preventing external code from extending it.
				abstract class Subclass extends TreeNodePublic {}
			});
		});

		it("instanceof public", () => {
			assert.throws(() => {
				// @ts-expect-error TreeNode is only type exported, preventing external code from extending it.
				const x = {} instanceof TreeNodePublic;
			});
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
