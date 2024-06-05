/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import { InternalTreeNode, TreeNode, TreeNodeValid } from "../../simple-tree/types.js";

import { NodeKind, TreeNodeSchema, type } from "../../simple-tree/index.js";
import { FlexTreeNode, FlexTreeNodeSchema } from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { RawTreeNode } from "../../simple-tree/rawNode.js";
// eslint-disable-next-line import/no-internal-modules
import { numberSchema } from "../../simple-tree/leafNodeSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { getFlexSchema } from "../../simple-tree/toFlexSchema.js";
import { validateUsageError } from "../utils.js";

describe("simple-tree types", () => {
	describe("TreeNode", () => {
		it("Assignability", () => {
			// @ts-expect-error TreeNode should not allow non-node objects.
			const n: TreeNode = {};
		});
		it("subclassing", () => {
			class Subclass extends TreeNode {
				public override get [type](): string {
					throw new Error("Method not implemented.");
				}
				public constructor() {
					super();
				}
			}

			assert.throws(() => new Subclass(), validateUsageError(/SchemaFactory/));
		});
	});

	describe("TreeNodeValid", () => {
		class MockFlexNode extends RawTreeNode<FlexTreeNodeSchema, number> {
			public constructor(public readonly simpleSchema: TreeNodeSchema) {
				super(getFlexSchema(simpleSchema), 0);
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
					assert(instance instanceof Subclass);
					assert(flexNode instanceof MockFlexNode);
					assert.equal(this, Subclass);
					return customThis as TreeNodeValid<T2>;
				}

				public static override buildRawNode<T2>(
					this: typeof TreeNodeValid<T2>,
					instance: TreeNodeValid<T2>,
					input: T2,
				): RawTreeNode<FlexTreeNodeSchema, unknown> {
					assert.equal(this, Subclass);
					assert(instance instanceof Subclass);
					log.push(`buildRawNode ${input}`);
					return new MockFlexNode(Subclass) as unknown as RawTreeNode<
						FlexTreeNodeSchema,
						unknown
					>;
				}

				protected static override constructorCached: typeof TreeNodeValid | undefined =
					undefined;

				protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>) {
					log.push("oneTimeSetup");
				}

				public override get [type](): string {
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

				public override get [type](): string {
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
				): RawTreeNode<FlexTreeNodeSchema, unknown> {
					return new MockFlexNode(
						this as unknown as TreeNodeSchema,
					) as unknown as RawTreeNode<FlexTreeNodeSchema, unknown>;
				}

				public override get [type](): string {
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
				): RawTreeNode<FlexTreeNodeSchema, unknown> {
					return new MockFlexNode(
						this as unknown as TreeNodeSchema,
					) as unknown as RawTreeNode<FlexTreeNodeSchema, unknown>;
				}

				public override get [type](): string {
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
