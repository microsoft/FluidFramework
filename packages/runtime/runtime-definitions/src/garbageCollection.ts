/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the garbage collection data returned by each node in the Container. It is used for
 * running GC in a document.
 */
export interface IGCData {
    /** The GC nodes of a Fluid object in the Container. Each node has an id and a set of routes to other GC nodes. */
    gcNodes: { [ id: string ]: string[] };
}

/**
 * Represents the format of the GC details that is stored in the summary for each node.
 */
export interface IGCDetails {
    /** Whether this node is a root node. Root nodes are never collected. */
    isRootNode: boolean;
    /** The GC data of this node. */
    gcData?: IGCData;
}
