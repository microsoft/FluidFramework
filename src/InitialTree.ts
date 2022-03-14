/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Definition, StableNodeId } from './Identifiers';
import { sharedTreeInitialTreeId } from './id-compressor';
import { ChangeNode_0_0_2 } from './persisted-types';

/**
 * The initial tree.
 * @public
 */
export const initialTree: ChangeNode_0_0_2 = {
	traits: {},
	definition: '51c58718-47b9-4fe4-ad46-56312f3b9e86' as Definition,
	identifier: sharedTreeInitialTreeId as StableNodeId,
};
