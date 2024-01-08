/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeNode, SchemaFactory } from "../../simple-tree/index.js";
import {
	InsertableTreeFieldFromImplicitField,
	InsertableTypedNode,
	NodeBuilderData,
	NodeFromSchema,
	TreeFieldFromImplicitField,
	TreeLeafValue,
	TreeNodeFromImplicitAllowedTypes,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaTypes.js";
import { TreeValue } from "../../core/index.js";
import { TreeFactory } from "../../treeFactory.js";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../util/index.js";

const schema = new SchemaFactory("com.example");

const factory = new TreeFactory({});

describe("schemaTypes", () => {
	it("TreeNode", () => {
		// @ts-expect-error TreeNode should not allow non-node objects.
		const n: TreeNode = {};
	});

	describe("insertable", () => {
		it("Lists", () => {
			const List = schema.array(schema.number);
			const NestedList = schema.array(List);

			const list: number[] = [5];
			const nestedList: number[][] = [[5]];

			// Not nested
			{
				type I1 = InsertableTreeFieldFromImplicitField<typeof schema.number>;
				type I2 = InsertableTypedNode<typeof schema.number>;
				type I3 = NodeBuilderData<typeof schema.number>;

				type N1 = NodeFromSchema<typeof schema.number>;
				type N2 = TreeNodeFromImplicitAllowedTypes<typeof schema.number>;
				type N3 = TreeFieldFromImplicitField<typeof schema.number>;

				type _check1 = requireTrue<areSafelyAssignable<I1, number>>;
				type _check2 = requireTrue<areSafelyAssignable<I2, number>>;
				type _check3 = requireTrue<areSafelyAssignable<I3, number>>;
				type _check4 = requireTrue<areSafelyAssignable<N1, number>>;
				type _check5 = requireTrue<areSafelyAssignable<N2, number>>;
				type _check6 = requireTrue<areSafelyAssignable<N3, number>>;
			}

			// Not nested
			{
				type I1 = InsertableTreeFieldFromImplicitField<typeof List>;
				type I2 = InsertableTypedNode<typeof List>;
				type I3 = NodeBuilderData<typeof List>;

				type N1 = NodeFromSchema<typeof List>;
				type N2 = TreeNodeFromImplicitAllowedTypes<typeof List>;
				type N3 = TreeFieldFromImplicitField<typeof List>;

				type _check1 = requireTrue<areSafelyAssignable<I1, I2>>;
				type _check2 = requireTrue<areSafelyAssignable<I2, N1 | Iterable<number>>>;
				type _check3 = requireTrue<areSafelyAssignable<I3, Iterable<number>>>;
				type _check4 = requireTrue<areSafelyAssignable<N1, N2>>;
				type _check5 = requireTrue<areSafelyAssignable<N2, N3>>;
			}

			// Nested
			{
				type I1 = InsertableTreeFieldFromImplicitField<typeof NestedList>;
				type I2 = InsertableTypedNode<typeof NestedList>;
				type I3 = NodeBuilderData<typeof NestedList>;

				type N1 = NodeFromSchema<typeof NestedList>;
				type N2 = TreeNodeFromImplicitAllowedTypes<typeof NestedList>;
				type N3 = TreeFieldFromImplicitField<typeof NestedList>;

				type _check1 = requireTrue<areSafelyAssignable<I1, I2>>;
				type _check2 = requireTrue<areSafelyAssignable<I2, N1 | I3>>;
				type _check3 = requireAssignableTo<Iterable<Iterable<number>>, I3>;
				type _check4 = requireTrue<areSafelyAssignable<N1, N2>>;
				type _check5 = requireTrue<areSafelyAssignable<N2, N3>>;
			}

			// Regression test for InsertableTypedNode not distributing over unions correctly.
			{
				type X = InsertableTypedNode<typeof List | typeof schema.number>;
				const x: X = [];
			}
		});

		it("Objects", () => {
			const A = schema.object("A", {});
			const B = schema.object("B", { a: A });

			const a = new A({});
			const b = new B({ a });
			const b2 = new B({ a: {} });

			// @ts-expect-error empty nodes should not allow non objects.
			const a2: NodeFromSchema<typeof A> = 0;
			// @ts-expect-error empty nodes should not allow non objects.
			const a3: InsertableTypedNode<typeof A> = 0;

			// @ts-expect-error empty nodes should not allow non-node.
			const a4: NodeFromSchema<typeof A> = {};

			// Insertable nodes allow non-node objects.
			const a5: InsertableTypedNode<typeof A> = {};
		});

		it("Customized Objects", () => {
			class A extends schema.object("A", {}) {
				public extra: number = 0;
			}
			class B extends schema.object("B", { a: A }) {
				public extra: string = "";
			}

			const a = new A({});
			const b = new B({ a });
			const b2 = new B({ a: {} });
		});

		it("Mixed Regression test", () => {
			class Note extends schema.object("Note", {}) {
				public isSelected: boolean = false;
			}

			class NodeMap extends schema.map("NoteMap", Note) {}
			class NodeList extends schema.array("NoteList", Note) {}

			class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

			const y = new NodeList([{}]);

			// There was a bug where unions with maps lost implicit contractibility, causing this to not compile:
			const x = new Canvas({
				stuff: [{}],
			});
		});
	});

	it("TreeLeafValue", () => {
		type _check = requireTrue<areSafelyAssignable<TreeLeafValue, TreeValue>>;
	});
});
