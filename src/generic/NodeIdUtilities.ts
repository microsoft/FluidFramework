/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeId } from '../Identifiers';

/**
 * An object which can generate node IDs
 * @public
 */
export interface NodeIdGenerator {
	/**
	 * Generate an identifier that may be used for a new node that will be inserted into this tree
	 * @param override - an optional UUID to associate with the new id for future lookup
	 */
	generateNodeId(override?: string): NodeId;
}
