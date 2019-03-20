import { Marker } from "./mergeTree";
import {
    ICombiningOp,
    IMergeTreeAnnotateMsg,
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
 * @param end The inclusive end position of the range to annotate
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
