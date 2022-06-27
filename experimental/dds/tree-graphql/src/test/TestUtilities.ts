/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/common-utils';
import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils';
import {
	SharedTree,
	TraitLabel,
	initialTree,
	Side,
	ChangeNode,
	Change,
	WriteFormat,
	NodeIdContext,
} from '@fluid-experimental/tree';

/** From the given `ChangeNode`, create a `SharedTree` which is suitable for use in a graphql query */
export function createTestQueryTree(nodeFactory: (idContext: NodeIdContext) => ChangeNode): SharedTree {
	const componentRuntime = new MockFluidDataStoreRuntime();
	componentRuntime.local = true;
	const tree = new SharedTree(componentRuntime, 'testSharedTree', WriteFormat.v0_1_1);
	const treeNode = nodeFactory(tree);
	// Follow the graphql convention that the root type of a schema must of type 'Query'
	// Traits are copied off of the Query node and applied to the root node
	// This is simply to save space/complexity in the tree, rather than adding the query root node _under_ the `initialTree` root node
	assert(treeNode.definition === 'Query', 'root node must be a Query node');
	for (const [label, trait] of Object.entries(treeNode.traits)) {
		tree.applyEdit(
			...Change.insertTree(
				[...trait],

				{
					referenceTrait: {
						label: label as TraitLabel,
						parent: tree.convertToNodeId(initialTree.identifier),
					},
					side: Side.After,
				}
			)
		);
	}

	return tree;
}
