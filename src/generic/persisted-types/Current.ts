/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeId } from '../../Identifiers';
import { TraitLocationInternal_0_0_2, TreeNode } from './Legacy002';

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @public
 */
export interface TraitLocationInternal extends Omit<TraitLocationInternal_0_0_2, 'parent'> {
	readonly parent: NodeId;
}

/**
 * JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
 * @public
 */
export type ChangeNode = TreeNode<ChangeNode, NodeId>;
