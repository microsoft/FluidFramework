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
