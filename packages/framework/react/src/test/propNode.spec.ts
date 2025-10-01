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
	type IsMappableObjectType,
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

	it("IsMappableObjectType", () => {
		allowUnused<requireAssignableTo<IsMappableObjectType<{ x: number }>, true>>();
		allowUnused<requireAssignableTo<IsMappableObjectType<{ readonly x: number }>, true>>();
		allowUnused<requireAssignableTo<IsMappableObjectType<Record<string, number>>, true>>();
		allowUnused<requireAssignableTo<IsMappableObjectType<number[]>, true>>();

		// Interestingly, maps are not nominally typed:
		allowUnused<requireAssignableTo<IsMappableObjectType<Map<number, number>>, true>>();
		// Constructors are not mappable:
		allowUnused<requireAssignableTo<IsMappableObjectType<typeof Map>, false>>();
		// Nor are functions
		allowUnused<requireAssignableTo<IsMappableObjectType<() => number>, false>>();

		class Nominal {
			public constructor(x: number) {}
			protected readonly _nominal = undefined;
		}

		// Instances of classes with private or protected fields are also not mappable:
		allowUnused<requireAssignableTo<IsMappableObjectType<Nominal>, false>>();
		// TreeNode is nominally type so not mappable:
		allowUnused<requireAssignableTo<IsMappableObjectType<TreeNode>, false>>();

		// Primitives are mappable since mapping over them leaves them unchanged in a generic context:
		allowUnused<requireAssignableTo<IsMappableObjectType<number>, true>>();

		type Mapped<T> = {
			[P in keyof T]: T[P];
		};

		type MappedNumberGeneric = Mapped<number>;

		allowUnused<requireAssignableTo<MappedNumberGeneric, number>>();
		allowUnused<requireAssignableTo<number, MappedNumberGeneric>>();

		// Oddly, mapping over a primitive type does change its type if done non-generically

		type MappedNumberDirect = {
			[P in keyof number]: number[P];
		};

		// @ts-expect-error MappedNumberDirect is not a number:
		allowUnused<requireAssignableTo<MappedNumberDirect, number>>();

		// Unions:
		// True Case: All members are mappable
		type SimpleUnion = { a: 1 } | { b: 2 };
		type MappedSimpleUnion = Mapped<SimpleUnion>;
		allowUnused<requireAssignableTo<MappedSimpleUnion, SimpleUnion>>();
		allowUnused<requireAssignableTo<SimpleUnion, MappedSimpleUnion>>();
		allowUnused<requireAssignableTo<IsMappableObjectType<SimpleUnion>, true>>();

		// False Case: Not all members are mappable
		type Union = { a: 1 } | { b: 2 } | number | Nominal;
		type MappedUnion = Mapped<Union>;

		// @ts-expect-error Union is lossy when mapped due to having lossy members:
		allowUnused<requireAssignableTo<MappedUnion, Union>>();
		allowUnused<requireAssignableTo<Union, MappedUnion>>();
		allowUnused<requireAssignableTo<IsMappableObjectType<Union>, false>>();
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
		// Must not break existing PropTreeNode types:
		allowUnused<requireAssignableTo<WrapNodes<PropTreeNode<Node>>, PropTreeNode<Node>>>();

		// Does not break maps, though also doesn't wrap the values:
		// Note: WrappedMap intentionally preserves the named type here: intellisense for this should be `type WrappedMap = Map<number, Node>`.
		// We have no known way to test that is preserved, since a flattened mapped type would assignable in both directions.
		type WrappedMap = WrapNodes<Map<number, Node>>;
		allowUnused<requireAssignableTo<WrappedMap, Map<number, Node>>>();

		// Does not break maps
		allowUnused<requireAssignableTo<WrapNodes<Map<number, number>>, Map<number, number>>>();

		// Avoids breaking nominal types while recursing into objects:
		allowUnused<
			requireAssignableTo<
				WrapNodes<{ a: 1; b: Node; c: Nominal; d: typeof Nominal; e: { inner: Node } }>,
				{
					a: 1;
					b: PropTreeNode<Node>;
					c: Nominal;
					d: typeof Nominal;
					e: { inner: PropTreeNode<Node> };
				}
			>
		>();

		class Nominal2 {
			protected readonly _nominal = undefined;
			public readonly child: Node = new Node({});
		}

		type WrappedNominal2 = WrapNodes<Nominal2>;
		allowUnused<requireAssignableTo<WrappedNominal2, Nominal2>>();

		// Does not break unions
		allowUnused<
			requireAssignableTo<
				WrapNodes<{ a: 1 } | { b: Node } | number | Nominal | Node>,
				{ a: 1 } | { b: PropTreeNode<Node> } | number | Nominal | PropTreeNode<Node>
			>
		>();

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
