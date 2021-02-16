/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, EditNode, NodeId } from "@fluid-experimental/tree";
import { Jsonable } from "@fluidframework/datastore-definitions";

export const nodeId = () => Math.random().toString(36).slice(2) as NodeId;

// Helper for creating Scalar nodes in SharedTree
export function makeScalar(value: Jsonable) {
    const node: EditNode = {
        identifier: nodeId(),
        definition: "scalar" as Definition,
        traits: {},
        payload: { base64: JSON.stringify(value) },
    };

    return node;
}
