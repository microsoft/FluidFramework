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
	TreeNode,
	NodeId,
	Payload,
} from '@fluid-experimental/tree';

/** From the given `ChangeNode`, create a `SharedTree` which is suitable for use in a graphql query */
export function createTestQueryTree(node: ChangeNode): SharedTree {
	const componentRuntime = new MockFluidDataStoreRuntime();
	componentRuntime.local = true;
	const tree = new SharedTree(componentRuntime, 'testSharedTree', true);
	assert(typeof node !== 'number', 'root node may not be detached');
	const treeNode = node as TreeNode<ChangeNode>;
	// Follow the graphql convention that the root type of a schema must of type 'Query'
	// Traits are copied off of the Query node and applied to the root node
	// This is simply to save space/complexity in the tree, rather than adding the query root node _under_ the `initialTree` root node
	assert(treeNode.definition === 'Query', 'root node must be a Query node');
	for (const [label, trait] of Object.entries(treeNode.traits)) {
		tree.editor.insert([...trait], {
			referenceTrait: { label: label as TraitLabel, parent: initialTree.identifier },
			side: Side.After,
		});
	}

	return tree;
}

/** Generates increasing numbers cast to NodeIds */
export class NodeIdGenerator {
	private nextId = 0;

	public new(): NodeId {
		return String(this.nextId++) as NodeId;
	}
}
