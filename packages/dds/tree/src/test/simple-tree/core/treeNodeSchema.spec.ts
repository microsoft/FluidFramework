/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	type AllowedTypes,
	type booleanSchema,
	type numberSchema,
	type stringSchema,
	type TreeNode,
} from "../../../simple-tree/index.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
} from "../../../util/index.js";
import {
	objectSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/node-kinds/index.js";

import type {
	InsertableTypedNode,
	NodeBuilderData,
	NodeFromSchema,
	TreeLeafValue,
	TreeNodeSchema,
	NodeKind,
	TreeNodeSchemaClass,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/core/treeNodeSchema.js";

import type { TreeValue } from "../../../core/index.js";

// TreeNodeSchemaCore constructor variance
{
	type S1 = TreeNodeSchemaClass<string, NodeKind, TreeNode, 0, false, unknown, 1 | 2>;
	type S2 = TreeNodeSchemaClass<
		string,
		NodeKind,
		TreeNode,
		0,
		false,
		unknown,
		2 | 3 | undefined
	>;
	type Combo = S1 | S2;
	// Ensure that two schema with different TConstructorExtra behave contravariantly
	type Extra = Combo extends TreeNodeSchemaClass<
		string,
		NodeKind,
		TreeNode,
		0,
		false,
		unknown,
		infer R
	>
		? R
		: "Nope";
	type _check = requireTrue<areSafelyAssignable<Extra, 2>>;
}

const schema = new SchemaFactory("com.example");

// Unconstrained
{
	// Input
	type I2 = InsertableTypedNode<TreeNodeSchema>;
	type I3 = NodeBuilderData<TreeNodeSchema>;

	type _check2 = requireTrue<areSafelyAssignable<I2, never>>;
	type _check3 = requireTrue<areSafelyAssignable<I3, never>>;

	// Output
	type N1 = NodeFromSchema<TreeNodeSchema>;

	type _check4 = requireTrue<areSafelyAssignable<N1, TreeNode | TreeLeafValue>>;
}

// NodeFromSchema
{
	class Simple extends schema.object("A", { x: [schema.number] }) {}
	class Customized extends schema.object("B", { x: [schema.number] }) {
		public customized = true;
	}

	// Class that implements both TreeNodeSchemaNonClass and TreeNodeSchemaNonClass
	class CustomizedBoth extends objectSchema("B", { x: [schema.number] }, true, false) {
		public customized = true;
	}

	type TA = NodeFromSchema<typeof Simple>;
	type _checkA = requireAssignableTo<TA, Simple>;

	type TB = NodeFromSchema<typeof Customized>;
	type _checkB = requireAssignableTo<TB, Customized>;

	type TC = NodeFromSchema<typeof CustomizedBoth>;
	type _checkC = requireAssignableTo<TC, CustomizedBoth>;
}

class A extends schema.object("A", { x: [schema.number, schema.string] }) {}
class B extends schema.object("B", { x: [schema.number, schema.null] }) {}

// InsertableTypedNode
{
	// Input
	type I5 = InsertableTypedNode<typeof numberSchema | typeof stringSchema>;
	type I8 = InsertableTypedNode<TreeNodeSchema>;

	type I6 = InsertableTypedNode<typeof numberSchema & typeof stringSchema>;
	type I7 = InsertableTypedNode<AllowedTypes & TreeNodeSchema>;

	type I9 = InsertableTypedNode<typeof A | typeof B>;

	// These types should behave contravariantly
	type _check5 = requireTrue<areSafelyAssignable<I5, never>>;
	type _check6 = requireTrue<areSafelyAssignable<I8, never>>;

	type t = never extends TreeNodeSchema ? true : false;

	// Actual normal use
	type I12 = InsertableTypedNode<typeof numberSchema>;
	type _check12 = requireTrue<areSafelyAssignable<I12, number>>;

	// boolean
	// boolean is sometimes a union of true and false, so it can break in its owns special ways
	type I13 = InsertableTypedNode<typeof booleanSchema>;
	type _check13 = requireTrue<areSafelyAssignable<I13, boolean>>;
}

// Regression test for InsertableTypedNode not distributing over unions correctly.
{
	const List = schema.array(schema.number);

	type X = InsertableTypedNode<typeof List | typeof schema.number>;
	type _check = requireTrue<areSafelyAssignable<X, never>>;
}

// TreeLeafValue
type _checkTreeLeafValue = requireTrue<areSafelyAssignable<TreeLeafValue, TreeValue>>;
