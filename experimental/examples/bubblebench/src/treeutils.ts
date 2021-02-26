/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Definition,
    EditNode,
    NodeId,
    TreeNode,
} from "@fluid-experimental/tree";
import { Jsonable } from "@fluidframework/datastore-definitions";

export const enum NodeKind {
    scalar = "s",
    object = "o",
    array = "a",
}

export const nodeId = () => Math.random().toString(36).slice(2) as NodeId;

// Helper for creating Scalar nodes in SharedTree
export const makeScalar = (value: Jsonable): TreeNode<EditNode> => ({
    identifier: nodeId(),
    definition: NodeKind.scalar as Definition,
    traits: {},
    payload: { base64: JSON.stringify(value) },
});

/* eslint-disable no-null/no-null */

export function fromJson(value: Jsonable): TreeNode<EditNode> {
    if (typeof value === "object") {
        if (Array.isArray(value)) {
            return {
                identifier: nodeId(),
                definition: NodeKind.array as Definition,
                traits: { items: value.map(fromJson) },
            };
        } else if (value === null) {
            return makeScalar(null);
        } else {
            const traits: PropertyDescriptorMap = {};

            for (const [label, json] of Object.entries(value)) {
                traits[label] = { value: [fromJson(json)], enumerable: true };
            }

            const node: EditNode = {
                identifier: nodeId(),
                definition: NodeKind.object as Definition,
                traits: Object.defineProperties({}, traits),
            };

            return node;
        }
    } else {
        return makeScalar(value);
    }
}

/* eslint-enable no-null/no-null */
