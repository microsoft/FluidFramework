/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The key to use for storing garbage collection blob in summary.
export const gcBlobKey = "gc";

/**
 * Represents the garbage collection data returned by each node in the Container. It is used for
 * running GC in a document.
 */
export interface IGarbageCollectionData {
    /** The GC nodes of a Fluid object in the Container. Each node has an id and a set of routes to other GC nodes. */
    gcNodes: { [ id: string ]: string[] };
}

/**
 * Represents the format of the GC details that is stored in the summary for each node.
 */
export interface IGarbageCollectionSummaryDetails {
    /** A list of routes to Fluid objects that are used in this node. */
    usedRoutes?: string[];
    /** The GC data of this node. */
    gcData?: IGarbageCollectionData;
}
