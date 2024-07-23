/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeId } from "./modularChangeTypes.js";

/**
 * A field-kind-agnostic change to a single node within a field.
 */
export interface GenericChange {
	/**
	 * Index within the field of the changed node.
	 */
	index: number;
	/**
	 * Change to the node.
	 */
	nodeChange: NodeId;
}

/**
 * A field-agnostic set of changes to the elements of a field.
 */
export type GenericChangeset = GenericChange[];
