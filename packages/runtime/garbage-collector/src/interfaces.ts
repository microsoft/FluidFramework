/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the result of a GC run.
 */
export interface IGCResult {
    /** The ids of nodes that are referenced in the referenced graph */
    referencedNodeIds: string[];
    /** The ids of nodes that are not-referenced or deleted in the referenced graph */
    deletedNodeIds: string[];
}
