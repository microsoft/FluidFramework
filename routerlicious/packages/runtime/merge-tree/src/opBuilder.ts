import { ISegment, Marker } from "./mergeTree";
import {
    ICombiningOp,
    IMergeTreeAnnotateMsg,
    IMergeTreeGroupMsg,
    IMergeTreeInsertMsg,
    IMergeTreeRemoveMsg,
    MergeTreeDeltaType,
 } from "./ops";
import { PropertySet } from "./properties";

/**
 * Creates the op for annotating the markers with the provided properties
 * @param marker The marker to annotate
 * @param props The properties to annotate the marker with
 * @param combiningOp Optional. Specifies how to combine values for the property, such as "incr" for increment.
 * @returns The annotate op
 */
export function createAnnotateMarkerOp(
    marker: Marker, props: PropertySet, combiningOp: ICombiningOp): IMergeTreeAnnotateMsg {

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
 * @param start The inclusive start postition of the range to annotate
 * @param end The exclusive end position of the range to annotate
 * @param props The properties to annotate the range with
 * @param combiningOp Optional. Specifies how to combine values for the property, such as "incr" for increment.
 * @returns The annotate op
 */
export function createAnnotateRangeOp(
    start: number, end: number, props: PropertySet, combiningOp: ICombiningOp): IMergeTreeAnnotateMsg {
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
 * @param start The inclusive start of the range to remove
 * @param end The exclusive end of the range to remove
 * @param register Optional. The name of the register to store the removed range in
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
 * @param pos The position to insert the segment at
 * @param segment The segment to insert
 */
export function createInsertSegmentOp(pos: number, segment: ISegment): IMergeTreeInsertMsg {
    return {
        pos1: pos,
        seg: segment.toJSONObject(),
        type: MergeTreeDeltaType.INSERT,
    };
}

/**
 *
 * @param ops The ops to group
 */
export function createGroupOp(
    ... ops: Array<IMergeTreeAnnotateMsg | IMergeTreeRemoveMsg | IMergeTreeInsertMsg>): IMergeTreeGroupMsg {
    return {
        ops,
        type: MergeTreeDeltaType.GROUP,
    };
}
