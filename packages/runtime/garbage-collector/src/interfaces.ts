/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGraphNode } from "@fluidframework/runtime-definitions";

/**
 * Represents the result of a GC run.
 */
export interface IGCResult {
    /** The list of nodes that are referenced in the referenced graph */
    referencedNodes: IGraphNode[];
    /** The list of nodes that are not-referenced or deleted in the referenced graph */
    deletedNodes: IGraphNode[];
}
