// tslint:disable

import * as MergeLib from "./index";
export enum OverlayNodePosition {
    Above,
    Left,
    Right,
    Append,
    Prepend,
    Root
}

export let onodeTypeKey = "onodeType";

function createTreeMarkerOps(treeRangeLabel: string, 
    beginMarkerPos: MergeLib.IRelativePosition, endMarkerPos: MergeLib.IRelativePosition,
    id: string, nodeType: string, beginMarkerProps?: MergeLib.PropertySet) {
    let endMarkerProps = MergeLib.createMap<any>();
    endMarkerProps[MergeLib.reservedReferenceIdKey] = "end-" + id;
    endMarkerProps[MergeLib.reservedRangeLabelsKey] = [treeRangeLabel];
    endMarkerProps[onodeTypeKey] = nodeType;
    
    if (!beginMarkerProps) {
        beginMarkerProps = MergeLib.createMap<any>();
    }
    beginMarkerProps[MergeLib.reservedReferenceIdKey] = id;
    beginMarkerProps[MergeLib.reservedRangeLabelsKey] = [treeRangeLabel];
    beginMarkerProps[onodeTypeKey] = nodeType;
    return [
        <MergeLib.IMergeTreeInsertMsg>{
            marker: { refType: MergeLib.ReferenceType.RangeBegin },
            relativePos1: beginMarkerPos,
            props: beginMarkerProps,
            type: MergeLib.MergeTreeDeltaType.INSERT,
        },
        <MergeLib.IMergeTreeInsertMsg>{
            marker: { refType: MergeLib.ReferenceType.RangeEnd },
            relativePos1: endMarkerPos,
            props: endMarkerProps,
            type: MergeLib.MergeTreeDeltaType.INSERT,
        }
    ]
}

let idSuffix = 0;
function makeId(client: MergeLib.Client) {
    let longClientId = client.longClientId;
    if (!longClientId) {
        longClientId = "";
    }
    return `${longClientId}Node${idSuffix++}`;
}

function endIdFromId(id: string) {
    return "end-"+id;
}

export function insertOverlayNode(treeLabel: string, client: MergeLib.Client, nodeType: string, 
    position: OverlayNodePosition, beginProps: MergeLib.PropertySet,
    refNodeId?: string) {
    let nodeId = makeId(client);
    switch (position) {
        case OverlayNodePosition.Append: {
            let endId = endIdFromId(refNodeId);
            let beforeRef = <MergeLib.IRelativePosition>{ id: endId, before: true };
            let markerOps = createTreeMarkerOps(treeLabel, beforeRef, beforeRef,
                nodeId, nodeType, beginProps);
            let groupOp = <MergeLib.IMergeTreeGroupMsg>{
                ops: markerOps,
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Prepend: {
            let afterRef = <MergeLib.IRelativePosition>{ id: refNodeId };
            let markerOps = createTreeMarkerOps(treeLabel, afterRef, afterRef,
                nodeId, nodeType, beginProps);
            let groupOp = <MergeLib.IMergeTreeGroupMsg>{
                ops: [markerOps[1], markerOps[0]],
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Above: {
            let endId = endIdFromId(refNodeId);
            let afterRef = <MergeLib.IRelativePosition>{ id: endId };
            let beforeRef = <MergeLib.IRelativePosition>{ id: refNodeId, before: true };
            let markerOps = createTreeMarkerOps(treeLabel, beforeRef, afterRef, nodeId,
                nodeType, beginProps);
            let groupOp = <MergeLib.IMergeTreeGroupMsg>{
                ops: markerOps,
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Left: {
            let beforeRef = <MergeLib.IRelativePosition>{ id: refNodeId, before: true };
            let markerOps = createTreeMarkerOps(treeLabel, beforeRef, beforeRef,
                nodeId, nodeType, beginProps);
            let groupOp = <MergeLib.IMergeTreeGroupMsg>{
                ops: markerOps,
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Right: {
            let endId = endIdFromId(refNodeId);
            let afterRef = <MergeLib.IRelativePosition>{ id: endId };
            let markerOps = createTreeMarkerOps(treeLabel, afterRef, afterRef,
                nodeId, nodeType, beginProps);
            let groupOp = <MergeLib.IMergeTreeGroupMsg>{
                ops: [markerOps[1], markerOps[0]],
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
        case OverlayNodePosition.Root: {
            let markerOps = createTreeMarkerOps(treeLabel, undefined, undefined,
            nodeId, nodeType, beginProps);
            markerOps[0].pos1 = 0;
            markerOps[1].pos1 = 0;
            let groupOp = <MergeLib.IMergeTreeGroupMsg>{
                ops: [markerOps[1], markerOps[0]],
                type: MergeLib.MergeTreeDeltaType.GROUP,
            };
            client.localTransaction(groupOp);
            break;
        }
    }
    return nodeId;
}

