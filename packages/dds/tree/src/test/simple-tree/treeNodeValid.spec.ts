/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type MostDerivedData,
	TreeNodeValid,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/treeNodeValid.js";

import type { FlexTreeNode } from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { numberSchema } from "../../simple-tree/leafNodeSchema.js";
import { validateUsageError } from "../utils.js";
import { brand } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { getUnhydratedContext } from "../../simple-tree/createContext.js";
import {
	inPrototypeChain,
	NodeKind,
	typeNameSymbol,
	typeSchemaSymbol,
	type Context,
	type InternalTreeNode,
	type TreeNodeSchema,
	UnhydratedFlexTreeNode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/core/index.js";

describe("TreeNodeValid", () => {
	class MockFlexNode extends UnhydratedFlexTreeNode {
		public constructor(public readonly simpleSchema: TreeNodeSchema) {
			super(
				getUnhydratedContext(simpleSchema),
				{ fields: new Map(), type: brand(simpleSchema.identifier) },
				undefined,
			);
		}
	}

	it("Valid subclass", () => {
		const log: string[] = [];
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		let customThis: TreeNodeValid<unknown> = {} as TreeNodeValid<unknown>;

		class Subclass extends TreeNodeValid<number> {
			public static readonly kind = NodeKind.Array;
			public static readonly identifier = "Subclass";
			public static readonly metadata = {};
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
			): UnhydratedFlexTreeNode {
				assert.equal(this, Subclass);
				assert(inPrototypeChain(Reflect.getPrototypeOf(instance), Subclass.prototype));
				log.push(`buildRawNode ${input}`);
				return new MockFlexNode(Subclass);
			}

			protected static override constructorCached: MostDerivedData | undefined = undefined;

			protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
				log.push("oneTimeSetup");
				return getUnhydratedContext(Subclass);
			}

			public static readonly childTypes: ReadonlySet<TreeNodeSchema> = new Set();

			public override get [typeNameSymbol](): string {
				throw new Error("Method not implemented.");
			}
			public override get [typeSchemaSymbol](): never {
				throw new Error("Method not implemented.");
			}
			public constructor(input: number | InternalTreeNode) {
				super(input);
				log.push("done");
			}
		}

		const node = new Subclass(1);
		assert.equal(node, customThis);
		// Avoid creating two nodes with same object, as that errors due to tree node kernel association.
		// Suggested way to avoid this lint is impossible in this case, so suppress the lint.
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		customThis = {} as TreeNodeValid<unknown>;

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
			public override get [typeSchemaSymbol](): never {
				throw new Error("Method not implemented.");
			}
		}

		assert.throws(
			() => new Subclass(),
			(error: Error) => validateAssertionError(error, /invalid schema class/),
		);
		// Ensure oneTimeSetup doesn't prevent error from rethrowing
		assert.throws(
			() => new Subclass(),
			(error: Error) => validateAssertionError(error, /invalid schema class/),
		);
	});

	it("multiple subclass valid", () => {
		const log: string[] = [];
		class Subclass extends TreeNodeValid<number> {
			public static readonly kind = NodeKind.Array;
			public static readonly identifier = "Subclass";
			public static readonly metadata = {};
			public static readonly info = numberSchema;
			public static readonly implicitlyConstructable: false;
			public static readonly childTypes: ReadonlySet<TreeNodeSchema> = new Set();

			public static override buildRawNode<T2>(
				this: typeof TreeNodeValid<T2>,
				instance: TreeNodeValid<T2>,
				input: T2,
			): UnhydratedFlexTreeNode {
				return new MockFlexNode(this as unknown as TreeNodeSchema);
			}

			public override get [typeNameSymbol](): string {
				throw new Error("Method not implemented.");
			}
			public override get [typeSchemaSymbol](): never {
				throw new Error("Method not implemented.");
			}
			public constructor() {
				super(0);
			}
		}

		class A extends Subclass {
			protected static override constructorCached: MostDerivedData | undefined = undefined;

			protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
				log.push("A");
				return getUnhydratedContext(A);
			}
		}

		class B extends Subclass {
			protected static override constructorCached: MostDerivedData | undefined = undefined;

			protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
				log.push("B");
				return getUnhydratedContext(A);
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
			public static readonly metadata = {};
			public static readonly info = numberSchema;
			public static readonly implicitlyConstructable: false;
			public static readonly childTypes: ReadonlySet<TreeNodeSchema> = new Set();

			public static override buildRawNode<T2>(
				this: typeof TreeNodeValid<T2>,
				instance: TreeNodeValid<T2>,
				input: T2,
			): UnhydratedFlexTreeNode {
				return new MockFlexNode(this as unknown as TreeNodeSchema);
			}

			public override get [typeNameSymbol](): string {
				throw new Error("Method not implemented.");
			}
			public override get [typeSchemaSymbol](): never {
				throw new Error("Method not implemented.");
			}
			public constructor() {
				super(0);
			}
		}

		class A extends Subclass {
			protected static override constructorCached: MostDerivedData | undefined = undefined;

			protected static override oneTimeSetup<T2>(this: typeof TreeNodeValid<T2>): Context {
				log.push(this.name);
				return getUnhydratedContext(this as typeof A);
			}
		}

		class B extends A {}

		const _b1 = new B();
		const _b2 = new B();
		assert.deepEqual(log, ["B"]);
		assert.throws(
			() => new A(),
			validateUsageError(
				`Two schema classes were used (A and B) which derived from the same SchemaFactory generated class ("Subclass"). This is invalid.`,
			),
		);
	});
});
