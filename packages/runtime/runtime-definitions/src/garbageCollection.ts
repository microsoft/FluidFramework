/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The key for the GC tree in summary.
 *
 * @internal
 */
export const gcTreeKey = "gc";
/**
 * They prefix for GC blobs in the GC tree in summary.
 *
 * @internal
 */
export const gcBlobPrefix = "__gc";
/**
 * The key for tombstone blob in the GC tree in summary.
 *
 * @internal
 */
export const gcTombstoneBlobKey = "__tombstones";
/**
 * The key for deleted nodes blob in the GC tree in summary.
 *
 * @internal
 */
export const gcDeletedBlobKey = "__deletedNodes";

/**
 * Garbage collection data returned by nodes in a Container.
 * Used for running GC in the Container.
 * @public
 */
export interface IGarbageCollectionData {
	/**
	 * The GC nodes of a Fluid object in the Container. Each node has an id and a set of routes to other GC nodes.
	 */
	gcNodes: { [id: string]: string[] };
}

/**
 * GC details provided to each node during creation.
 * @alpha
 */
export interface IGarbageCollectionDetailsBase {
	/**
	 * A list of routes to Fluid objects that are used in this node.
	 */
	usedRoutes?: string[];
	/**
	 * The GC data of this node.
	 */
	gcData?: IGarbageCollectionData;
}
