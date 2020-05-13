/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import MergeLib from "./index";

export enum OverlayNodePosition {
    Above,
    Left,
    Right,
    Append,
    Prepend,
    Root,
}

export const onodeTypeKey = "onodeType";

function createTreeMarkerOps(
    treeRangeLabel: string,
    beginMarkerPos: MergeLib.IRelativePosition,
    endMarkerPos: MergeLib.IRelativePosition,
    id: string,
    nodeType: string,
    beginMarkerProps?: MergeLib.PropertySet): [MergeLib.IMergeTreeInsertMsg, MergeLib.IMergeTreeInsertMsg] {
    const endMarkerProps = MergeLib.createMap<any>();
    endMarkerProps[MergeLib.reservedMarkerIdKey] = endIdFromId(id);
    endMarkerProps[MergeLib.reservedRangeLabelsKey] = [treeRangeLabel];
    endMarkerProps[onodeTypeKey] = nodeType;

    if (!beginMarkerProps) {
        // eslint-disable-next-line no-param-reassign
        beginMarkerProps = MergeLib.createMap<any>();
    }
    beginMarkerProps[MergeLib.reservedMarkerIdKey] = id;
    beginMarkerProps[MergeLib.reservedRangeLabelsKey] = [treeRangeLabel];
    beginMarkerProps[onodeTypeKey] = nodeType;
    return [
        {
            seg: { marker: { refType: MergeLib.ReferenceType.NestBegin }, props: beginMarkerProps },
            relativePos1: beginMarkerPos,
            type: MergeLib.MergeTreeDeltaType.INSERT,
        },
        {
            seg: { marker: { refType: MergeLib.ReferenceType.NestEnd }, props: endMarkerProps },
            relativePos1: endMarkerPos,
            type: MergeLib.MergeTreeDeltaType.INSERT,
        },
    ];
}

let idSuffix = 0;
function makeId(client: MergeLib.Client) {
    let longClientId = client.longClientId;
    if (!longClientId) {
        longClientId = "";
    }
    return `${longClientId}Node${idSuffix++}`;
}

const endIdFromId = (id: string) => `end-${id}`;

export function insertOverlayNode(
    treeLabel: string, client: MergeLib.Client, nodeType: string,
    position: OverlayNodePosition, beginProps: MergeLib.PropertySet,
    refNodeId?: string) {
    const nodeId = makeId(client);
    /* eslint-disable default-case */
    switch (position) {
        case OverlayNodePosition.Append: {
            const endId = endIdFromId(refNodeId);
            const beforeRef: MergeLib.IRelativePosition = { id: endId, before: true };
            const markerOps = createTreeMarkerOps(treeLabel, beforeRef, beforeRef,
                nodeId, nodeType, beginProps);
            const groupOp: MergeLib.IMergeTreeGroupMsg = {
                ops: markerOps,
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Prepend: {
            const afterRef: MergeLib.IRelativePosition = { id: refNodeId };
            const markerOps = createTreeMarkerOps(treeLabel, afterRef, afterRef,
                nodeId, nodeType, beginProps);
            const groupOp: MergeLib.IMergeTreeGroupMsg = {
                ops: [markerOps[1], markerOps[0]],
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Above: {
            const endId = endIdFromId(refNodeId);
            const afterRef: MergeLib.IRelativePosition = { id: endId };
            const beforeRef: MergeLib.IRelativePosition = { id: refNodeId, before: true };
            const markerOps = createTreeMarkerOps(treeLabel, beforeRef, afterRef, nodeId,
                nodeType, beginProps);
            const groupOp: MergeLib.IMergeTreeGroupMsg = {
                ops: markerOps,
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Left: {
            const beforeRef: MergeLib.IRelativePosition = { id: refNodeId, before: true };
            const markerOps = createTreeMarkerOps(treeLabel, beforeRef, beforeRef,
                nodeId, nodeType, beginProps);
            const groupOp: MergeLib.IMergeTreeGroupMsg = {
                ops: markerOps,
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Right: {
            const endId = endIdFromId(refNodeId);
            const afterRef: MergeLib.IRelativePosition = { id: endId };
            const markerOps = createTreeMarkerOps(treeLabel, afterRef, afterRef,
                nodeId, nodeType, beginProps);
            const groupOp: MergeLib.IMergeTreeGroupMsg = {
                ops: [markerOps[1], markerOps[0]],
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Root: {
            const markerOps = createTreeMarkerOps(treeLabel, undefined, undefined,
                nodeId, nodeType, beginProps);
            markerOps[0].pos1 = 0;
            markerOps[1].pos1 = 0;
            const groupOp: MergeLib.IMergeTreeGroupMsg = {
                ops: [markerOps[1], markerOps[0]],
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
    }
    /* eslint-enable default-case */
    return nodeId;
}
