/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeChangeset } from "./modularChangeTypes.js";

/**
 * A field-kind-agnostic change to a single node within a field.
 */
export interface GenericChange<TChildChange = NodeChangeset> {
	/**
	 * Index within the field of the changed node.
	 */
	index: number;
	/**
	 * Change to the node.
	 */
	nodeChange: TChildChange;
}

/**
 * A field-agnostic set of changes to the elements of a field.
 */
export type GenericChangeset<TChildChange = NodeChangeset> = GenericChange<TChildChange>[];
