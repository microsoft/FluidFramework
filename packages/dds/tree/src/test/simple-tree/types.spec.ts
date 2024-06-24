/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type InternalTreeNode,
	TreeNode,
	TreeNodeValid,
	inPrototypeChain,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/types.js";
import {
	NodeKind,
	type TreeNodeSchema,
	typeNameSymbol,
	// Used to test that TreeNode is a type only export.
	TreeNode as TreeNodePublic,
} from "../../simple-tree/index.js";
import type {
	FlexTreeNode,
	FlexTreeNodeSchema,
	MapTreeNode,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { numberSchema } from "../../simple-tree/leafNodeSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { getFlexSchema } from "../../simple-tree/toFlexSchema.js";
import { validateUsageError } from "../utils.js";
import { brand } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { EagerMapTreeNode } from "../../feature-libraries/flex-map-tree/mapTreeNode.js";

describe("simple-tree types", () => {
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
				public constructor() {
					super();
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

		it("instancof public", () => {
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

	describe("TreeNodeValid", () => {
		class MockFlexNode extends EagerMapTreeNode<FlexTreeNodeSchema> {
			public constructor(public readonly simpleSchema: TreeNodeSchema) {
				super(
					getFlexSchema(simpleSchema),
					{ fields: new Map(), type: brand(simpleSchema.identifier) },
					undefined,
				);
			}
		}

		it("Valid subclass", () => {
			const log: string[] = [];
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			const customThis: TreeNodeValid<unknown> = {} as TreeNodeValid<unknown>;

			class Subclass extends TreeNodeValid<number> {
				public static readonly kind = NodeKind.Array;
				public static readonly identifier = "Subclass";
				public static readonly info = numberSchema;
				public static readonly implicitlyConstructable: false;

				public static override prepareInstance<T2>(
					this: typeof TreeNodeValid<T2>,
					instance: TreeNodeValid<T2>,
					flexNode: FlexTreeNode,
				): TreeNodeValid<T2> {
					log.push("prepareInstance");
					assert(inPrototypeChain(Reflect.getPrototypeOf(instance), Subclass.prototype));
					assert(flexNode instanceof MockFlexNode);
					assert.equal(this, Subclass);
					return customThis as TreeNodeValid<T2>;
				}

				public static override buildRawNode<T2>(
					this: typeof TreeNodeValid<T2>,
					instance: TreeNodeValid<T2>,
					input: T2,
				): MapTreeNode {
					assert.equal(this, Subclass);
					assert(inPrototypeChain(Reflect.getPrototypeOf(instance), Subclass.prototype));
					log.push(`buildRawNode ${input}`);
					return new MockFlexNode(Subclass);
				}

				protected static override constructorCached: typeof TreeNodeValid | undefined =
					undefined;

				protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>) {
					log.push("oneTimeSetup");
				}

				public override get [typeNameSymbol](): string {
					throw new Error("Method not implemented.");
				}
				public constructor(input: number | InternalTreeNode) {
					super(input);
					log.push("done");
				}
			}

			const node = new Subclass(1);
			const node2 = new Subclass(2);
			assert.deepEqual(log, [
				"oneTimeSetup",

				"buildRawNode 1",
				"prepareInstance",
				"done",

				"buildRawNode 2",
				"prepareInstance",
				"done",
			]);

			assert.equal(node, customThis);
			assert.equal(node2, customThis);
		});

		it("invalid subclass - missing constructorCached", () => {
			class Subclass extends TreeNodeValid<number> {
				public constructor() {
					super(1);
				}

				public override get [typeNameSymbol](): string {
					throw new Error("Method not implemented.");
				}
			}

			assert.throws(
				() => new Subclass(),
				(error: Error) => validateAssertionError(error, /constructorCached/),
			);
			// Ensure oneTimeSetup doesn't prevent error from rethrowing
			assert.throws(
				() => new Subclass(),
				(error: Error) => validateAssertionError(error, /constructorCached/),
			);
		});

		it("multiple subclass valid", () => {
			const log: string[] = [];
			class Subclass extends TreeNodeValid<number> {
				public static readonly kind = NodeKind.Array;
				public static readonly identifier = "Subclass";
				public static readonly info = numberSchema;
				public static readonly implicitlyConstructable: false;

				public static override buildRawNode<T2>(
					this: typeof TreeNodeValid<T2>,
					instance: TreeNodeValid<T2>,
					input: T2,
				): MapTreeNode {
					return new MockFlexNode(this as unknown as TreeNodeSchema);
				}

				public override get [typeNameSymbol](): string {
					throw new Error("Method not implemented.");
				}
				public constructor() {
					super(0);
				}
			}

			class A extends Subclass {
				protected static override constructorCached: typeof TreeNodeValid | undefined =
					undefined;

				protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>) {
					log.push("A");
				}
			}

			class B extends Subclass {
				protected static override constructorCached: typeof TreeNodeValid | undefined =
					undefined;

				protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>) {
					log.push("B");
				}
			}

			const _a1 = new A();
			const _a2 = new A();
			const _b1 = new B();
			const _b2 = new B();
			assert.deepEqual(log, ["A", "B"]);
		});

		it("multiple subclass chain", () => {
			const log: string[] = [];
			class Subclass extends TreeNodeValid<number> {
				public static readonly kind = NodeKind.Array;
				public static readonly identifier = "Subclass";
				public static readonly info = numberSchema;
				public static readonly implicitlyConstructable: false;

				public static override buildRawNode<T2>(
					this: typeof TreeNodeValid<T2>,
					instance: TreeNodeValid<T2>,
					input: T2,
				): MapTreeNode {
					return new MockFlexNode(this as unknown as TreeNodeSchema);
				}

				public override get [typeNameSymbol](): string {
					throw new Error("Method not implemented.");
				}
				public constructor() {
					super(0);
				}
			}

			class A extends Subclass {
				protected static override constructorCached: typeof TreeNodeValid | undefined =
					undefined;

				protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>) {
					log.push(this.name);
				}
			}

			class B extends A {}

			const _b1 = new B();
			const _b2 = new B();
			assert.deepEqual(log, ["B"]);
			assert.throws(
				() => new A(),
				validateUsageError(
					`Two schema classes were instantiated (A and B) which derived from the same SchemaFactory generated class. This is invalid`,
				),
			);
		});
	});
});
