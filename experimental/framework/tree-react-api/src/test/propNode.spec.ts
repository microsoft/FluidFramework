/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, type TreeNode } from "@fluidframework/tree";
import { allowUnused } from "@fluidframework/tree/internal";
import type { requireAssignableTo } from "@fluidframework/tree/internal";

import {
	toPropTreeNode,
	toPropTreeRecord,
	unwrapPropTreeNode,
	type PropTreeNode,
	type WrapNodes,
	type WrapPropTreeNodeRecord,
} from "../propNode.js";

describe("propNode", () => {
	it("PropTreeNode", () => {
		const builder = new SchemaFactory("tree-react-api");

		class Inventory extends builder.object("Inventory", {
			nuts: builder.number,
		}) {}

		const node = new Inventory({ nuts: 5 });

		const prop = toPropTreeNode(node);

		// @ts-expect-error Read access should be removed
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const nuts = prop.nuts;

		const node2 = unwrapPropTreeNode(prop);

		assert.equal(node2, node);
	});

	it("PropTreeNode value", () => {
		const value = 5;

		// toPropTreeNode leaves leaves alone
		const prop: 5 = toPropTreeNode(value);

		const node2: 5 = unwrapPropTreeNode(prop);

		assert.equal(node2, value);
	});

	it("NodeRecord", () => {
		const builder = new SchemaFactory("tree-react-api");

		class Inventory extends builder.object("Inventory", { nuts: builder.number }) {}

		const record = toPropTreeRecord({ num: 5, node: new Inventory({ nuts: 5 }) });
		const prop = record.node;

		// @ts-expect-error Read access should be removed
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const nuts = prop.nuts;

		const node = unwrapPropTreeNode(prop);

		assert.equal(node, prop);
	});

	it("WrapPropTreeNodeRecord", () => {
		const builder = new SchemaFactory("tree-react-api");
		class Node extends builder.object("Node", {}) {}

		type Wrapped = WrapPropTreeNodeRecord<{ a: 1; b: Node }>;
		allowUnused<requireAssignableTo<Wrapped, { a: 1; b: PropTreeNode<Node> }>>();
	});

	it("WrapNodes", () => {
		const builder = new SchemaFactory("tree-react-api");

		class Node extends builder.object("Node", {}) {}

		class Nominal {
			public constructor(x: number) {}
			protected readonly _nominal = undefined;
		}

		allowUnused<requireAssignableTo<WrapNodes<Set<number>>, Set<number>>>();
		allowUnused<requireAssignableTo<WrapNodes<Nominal>, Nominal>>();
		allowUnused<requireAssignableTo<WrapNodes<Node>, PropTreeNode<Node>>>();
		allowUnused<
			requireAssignableTo<WrapNodes<{ a: 1; b: Node }>, { a: 1; b: PropTreeNode<Node> }>
		>();

		// Trying to wrap the nodes in this case could likely cause issues
		allowUnused<
			requireAssignableTo<
				WrapNodes<{ a: 1; b: Node; c: Nominal; d: typeof Nominal }>,
				{ a: 1; b: Node; c: Nominal; d: typeof Nominal }
			>
		>();

		class Nominal2 {
			protected readonly _nominal = undefined;
			public readonly child: Node = new Node({});
		}

		type WrappedNominal2 = WrapNodes<Nominal2>;
		allowUnused<requireAssignableTo<WrappedNominal2, Nominal2>>();

		/**
		 * Example deep mapped type which wraps TreeNodes in PropTreeNodes:
		 * this causes issues which is why its not used in WrapNodes.
		 *
		 * Note that this doesn't handle all cases as it still fails to handle methods/properties that read from nodes (handling that is impossible),
		 * and methods which return nodes (handling that is possible if they include TreeNode in the return type, but impossible if not).
		 */
		type MappedDeep<T> = T extends TreeNode
			? PropTreeIfNode<T>
			: T extends object
				? {
						readonly [P in keyof T]: MappedDeep<T[P]>;
					}
				: T;
		type PropTreeIfNode<T> = T extends TreeNode ? PropTreeNode<T> : T;

		type MappedDeepMixed = MappedDeep<{ a: 1; b: Node; c: Nominal; d: typeof Nominal }>;

		// DeepWrappedMixed removed the nominal typing! Thats bad!
		allowUnused<requireAssignableTo<MappedDeepMixed["c"], { unrelated?: unknown }>>();

		// @ts-expect-error The fact that "d" was a constructor was erased. Thats bad!
		type Y = ConstructorParameters<MappedDeepMixed["d"]>;

		// This correctly transforms the child field, but destroys the nominal typing of Nominal2
		type MappedDeepNominal2 = MappedDeep<Nominal2>;

		// Child transformed correctly:
		allowUnused<
			requireAssignableTo<MappedDeepNominal2, { readonly child: PropTreeNode<Node> }>
		>();
		// But lost the nominal typing:
		allowUnused<
			requireAssignableTo<{ readonly child: PropTreeNode<Node> }, MappedDeepNominal2>
		>();
	});
});
