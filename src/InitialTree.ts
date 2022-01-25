/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, NodeId } from './Identifiers';
import { ChangeNode } from './generic';
import { sharedTreeInitialTreeId } from './id-compressor';

/**
 * The initial tree.
 * @public
 */
export const initialTree: ChangeNode = {
	traits: {},
	definition: '51c58718-47b9-4fe4-ad46-56312f3b9e86' as Definition,
	identifier: sharedTreeInitialTreeId as NodeId,
};
