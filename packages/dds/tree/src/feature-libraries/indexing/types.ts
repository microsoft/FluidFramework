/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * an array of nodes that is guaranteed to have at least one element
 *
 * @alpha
 */
export type TreeIndexNodes<TNode> = readonly [first: TNode, ...rest: TNode[]];

/**
 * An index allows lookup content from a tree using keys.
 * @remarks
 * The index will be kept up to date with the {@link TreeBranchAlpha} it is associated with.
 * Keeping an index up to date incurs overhead.
 * Therefore, indexes should only be created when needed and disposed when no longer needed.
 * @privateRemarks
 * We have various disposable interfaces. Perhaps this should extend one.
 * Currently all of these indexes are generated on load and exist only in memory (do not persist anything to the document).
 * In the future, we may want to support indexes which persist some content, allowing them to be kept up to date when when only loading part of a tree.
 * Since currently partially loading a tree is not supported, there is no need for this.
 * At some point the low level shared tree index type for persisted indexes could be leveraged to provide user facing extensible sets of persisted indexes.
 * @sealed
 * @alpha
 */
export interface TreeIndex<TKey, TValue> extends ReadonlyMap<TKey, TValue> {
	/**
	 * Disposes the index such that it can no longer be used and receives no updates for changes in the tree.
	 * @remarks
	 * An index may not be used after it is disposed.
	 */
	dispose(): void;
}
