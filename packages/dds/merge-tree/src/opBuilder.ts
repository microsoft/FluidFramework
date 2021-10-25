/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment, Marker } from "./mergeTree";
import {
    ICombiningOp,
    IMergeTreeAnnotateMsg,
    IMergeTreeGroupMsg,
    IMergeTreeInsertMsg,
    IMergeTreeRemoveMsg,
    MergeTreeDeltaType,
    IMergeTreeDeltaOp,
} from "./ops";
import { PropertySet } from "./properties";

/**
 * Creates the op for annotating the markers with the provided properties
 * @param marker - The marker to annotate
 * @param props - The properties to annotate the marker with
 * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
 * @returns The annotate op
 */
export function createAnnotateMarkerOp(
    marker: Marker, props: PropertySet, combiningOp: ICombiningOp): IMergeTreeAnnotateMsg | undefined {
    const id = marker.getId();
    if (!id) {
        return undefined;
    }

    return {
        combiningOp,
        props,
        relativePos1: { id, before: true },
        relativePos2: { id },
        type: MergeTreeDeltaType.ANNOTATE,
    };
}

/**
 * Creates the op for annotating the range with the provided properties
 * @param start - The inclusive start position of the range to annotate
 * @param end - The exclusive end position of the range to annotate
 * @param props - The properties to annotate the range with
 * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
 * @returns The annotate op
 */
export function createAnnotateRangeOp(
    start: number, end: number, props: PropertySet, combiningOp: ICombiningOp | undefined): IMergeTreeAnnotateMsg {
    return {
        combiningOp,
        pos1: start,
        pos2: end,
        props,
        type: MergeTreeDeltaType.ANNOTATE,
    };
}

/**
 * Creates the op to remove a range and puts the content of the removed range in a register
 * if a register name is provided
 *
 * @param start - The inclusive start of the range to remove
 * @param end - The exclusive end of the range to remove
 * @param register - Optional. The name of the register to store the removed range in
 */
export function createRemoveRangeOp(start: number, end: number, register?: string): IMergeTreeRemoveMsg {
    return {
        pos1: start,
        pos2: end,
        register,
        type: MergeTreeDeltaType.REMOVE,
    };
}

/**
 *
 * @param pos - The position to insert the segment at
 * @param segment - The segment to insert
 */
export function createInsertSegmentOp(pos: number, segment: ISegment): IMergeTreeInsertMsg {
    return createInsertOp(
        pos,
        segment.toJSONObject());
}

export function createInsertOp(pos: number, segSpec: any): IMergeTreeInsertMsg {
    return {
        pos1: pos,
        seg: segSpec,
        type: MergeTreeDeltaType.INSERT,
    };
}

/**
 *
 * @param pos - The position to insert the register contents at
 * @param register - The name of the register to insert the value of
 */
export function createInsertFromRegisterOp(pos: number, register: string): IMergeTreeInsertMsg {
    return {
        pos1: pos,
        register,
        type: MergeTreeDeltaType.INSERT,
    };
}

/**
 *
 * @param start - The inclusive start of the range to insert into the register
 * @param end - The exclusive end of the range to insert into the register
 * @param register - The name of the register to insert the range contents into
 */
export function createInsertToRegisterOp(start: number, end: number, register: string): IMergeTreeInsertMsg {
    return {
        pos1: start,
        pos2: end,
        register,
        type: MergeTreeDeltaType.INSERT,
    };
}

/**
 *
 * @param ops - The ops to group
 */
export function createGroupOp(
    ...ops: IMergeTreeDeltaOp[]): IMergeTreeGroupMsg {
    return {
        ops,
        type: MergeTreeDeltaType.GROUP,
    };
}
