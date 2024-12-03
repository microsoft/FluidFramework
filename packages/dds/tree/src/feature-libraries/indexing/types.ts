/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";

/**
 * an array of nodes that is guaranteed to have at least one element
 *
 * @alpha
 */
export type TreeIndexNodes<TNode> = readonly [first: TNode, ...rest: TNode[]];

/**
 * Value that may be used as keys in a {@link TreeIndex}.
 *
 * @privateRemarks
 * no-new-null is disabled for this type so that it supports the TreeValue type.
 *
 * @alpha
 */
// eslint-disable-next-line @rushstack/no-new-null
export type TreeIndexKey = number | string | boolean | IFluidHandle | null;

/**
 * A index where values are keyed on {@link TreeIndexKey}s.
 *
 * @alpha
 */
export interface TreeIndex<TKey extends TreeIndexKey, TValue>
	extends ReadonlyMap<TKey, TValue> {
	/**
	 * Disposes the index such that it can no longer be used and receives no updates from the forest
	 */
	dispose(): void;
}
