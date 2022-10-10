/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The key to use for storing garbage collection blob in summary.
export const gcBlobKey = "gc";

/**
 * Garbage collection data returned by nodes in a Container.
 * Used for running GC in the Container.
 */
export interface IGarbageCollectionData {
    /** The GC nodes of a Fluid object in the Container. Each node has an id and a set of routes to other GC nodes. */
    gcNodes: { [ id: string ]: string[]; };
}

/**
 * GC details provided to each node during creation.
 */
export interface IGarbageCollectionDetailsBase {
    /** A list of routes to Fluid objects that are used in this node. */
    usedRoutes?: string[];
    /** The GC data of this node. */
    gcData?: IGarbageCollectionData;
    /** If this node is unreferenced, the time when it was marked as such. */
    unrefTimestamp?: number;
}
