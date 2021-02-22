/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Change, Definition, EditNode, NodeId, Snapshot, TraitLabel } from "@fluid-experimental/tree";
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

export const readScalar = (tree: Snapshot, parent: NodeId, label: TraitLabel) =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    JSON.parse(tree.getSnapshotNode(tree.getTrait({ parent, label })[0]).payload!.base64) as Jsonable;

export const editScalar = (tree: Snapshot, parent: NodeId, label: TraitLabel, value: Jsonable) =>
    Change.setPayload(
        tree.getTrait({ parent, label })[0],
        { base64: JSON.stringify(value) });
