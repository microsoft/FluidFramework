/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNode, TreeNodeSchemaClass } from "../../../simple-tree/index.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

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
