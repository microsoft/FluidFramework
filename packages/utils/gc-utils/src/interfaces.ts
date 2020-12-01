/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the result of a GC run.
 */
export interface IGCResult {
    /** The list of nodes that are referenced in the referenced graph */
    referencedNodes: IGraphNode[];
    /** The list of nodes that are not-referenced or deleted in the referenced graph */
    deletedNodes: IGraphNode[];
}

/**
 * Represents a node in a graph that has a unique id and a list of routes to other nodes.
 */
export interface IGraphNode {
    /** This node's indentifier */
    id: string;
    /** A list of routes to other nodes in the graph */
    outboundRoutes: string[];
}
