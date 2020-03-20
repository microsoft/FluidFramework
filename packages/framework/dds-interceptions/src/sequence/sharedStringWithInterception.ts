/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MergeTree from "@microsoft/fluid-merge-tree";
import { SharedString } from "@microsoft/fluid-sequence";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

/**
 * - Create a new object from the passed SharedString.
 * - Modify the methods that insert / remove / annotate the properties of the SharedString to call
 *   the propertyInterceptionCallback to get new properties.
 * - Use these new properties to call the underlying SharedString.
 * - The propertyInterceptionCallback and the call to the underlying SharedString are wrapped around an
 *   orderSequentially call to batch any operations that might happen in the callback.
 *
 * @param sharedString - The underlying SharedString
 * @param context - The IComponentContext that will be used to call orderSequentially
 * @param propertyInterceptionCallback - The interception callback to be called
 *
 * @returns A new SharedString that intercepts the methods modifying the SharedString properties.
 */
export function createSharedStringWithInterception(
    sharedString: SharedString,
    context: IComponentContext,
    propertyInterceptionCallback: (props?: MergeTree.PropertySet) => MergeTree.PropertySet): SharedString {
    const sharedStringWithInterception = Object.create(sharedString);

    /**
     * Inserts a marker at a relative postition.
     *
     * @param relativePos1 - The relative postition to insert the marker at
     * @param refType - The reference type of the marker
     * @param props - The properties of the marker
     */
    sharedStringWithInterception.insertMarkerRelative = (
        relativePos1: MergeTree.IRelativePosition,
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet) => {
        context.hostRuntime.orderSequentially(() => {
            sharedString.insertMarkerRelative(relativePos1, refType, propertyInterceptionCallback(props));
        });
    };

    /**
     * Inserts a marker at the postition.
     *
     * @param pos - The postition to insert the marker at
     * @param refType - The reference type of the marker
     * @param props - The properties of the marker
     */
    sharedStringWithInterception.insertMarker = (
        pos: number,
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet) => {
        let insertOp;
        context.hostRuntime.orderSequentially(() => {
            insertOp = sharedString.insertMarker(pos, refType, propertyInterceptionCallback(props));
        });
        return insertOp;
    };

    /**
     * Inserts the text at a relative postition.
     *
     * @param relativePos1 - The relative postition to insert the text at
     * @param text - The text to insert
     * @param props - The properties of text
     */
    sharedStringWithInterception.insertTextRelative = (
        relativePos1: MergeTree.IRelativePosition,
        text: string,
        props?: MergeTree.PropertySet) => {
        context.hostRuntime.orderSequentially(() => {
            sharedString.insertTextRelative(relativePos1, text, propertyInterceptionCallback(props));
        });
    };

    /**
     * Inserts the text at the postition.
     *
     * @param pos - The postition to insert the text at
     * @param text - The text to insert
     * @param props - The properties of text
     */
    sharedStringWithInterception.insertText = (pos: number, text: string, props?: MergeTree.PropertySet) => {
        context.hostRuntime.orderSequentially(() => {
            sharedString.insertText(pos, text, propertyInterceptionCallback(props));
        });
    };

    /**
     * Replaces a range with the provided text.
     *
     * @param start - The inclusive start of the range to replace
     * @param end - The exclusive end of the range to replace
     * @param text - The text to replace the range with
     * @param props - Optional. The properties of the replacement text
     */
    sharedStringWithInterception.replaceText = (
        start: number,
        end: number,
        text: string,
        props?: MergeTree.PropertySet) => {
        context.hostRuntime.orderSequentially(() => {
            sharedString.replaceText(start, end, text, propertyInterceptionCallback(props));
        });
    };

    /**
     * Annotates the marker with the provided properties and calls the callback on concensus.
     *
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param consensusCallback - The callback called when consensus is reached
     */
    sharedStringWithInterception.annotateMarkerNotifyConsensus = (
        marker: MergeTree.Marker,
        props: MergeTree.PropertySet,
        callback: (m: MergeTree.Marker) => void) => {
        context.hostRuntime.orderSequentially(() => {
            sharedString.annotateMarkerNotifyConsensus(marker, propertyInterceptionCallback(props), callback);
        });
    };

    /**
     * Annotates the marker with the provided properties.
     *
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     */
    sharedStringWithInterception.annotateMarker = (
        marker: MergeTree.Marker,
        props: MergeTree.PropertySet,
        combiningOp?: MergeTree.ICombiningOp) => {
        context.hostRuntime.orderSequentially(() => {
            sharedString.annotateMarker(marker, propertyInterceptionCallback(props), combiningOp);
        });
    };

    /**
     * Annotates the range with the provided properties.
     *
     * @param start - The inclusive start postition of the range to annotate
     * @param end - The exclusive end position of the range to annotate
     * @param props - The properties to annotate the range with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     *
     */
    sharedStringWithInterception.annotateRange = (
        start: number,
        end: number,
        props: MergeTree.PropertySet,
        combiningOp?: MergeTree.ICombiningOp) => {
        context.hostRuntime.orderSequentially(() => {
            sharedString.annotateRange(start, end, propertyInterceptionCallback(props), combiningOp);
        });
    };

    /**
     * Inserts the segment at the given position
     *
     * @param pos - The position to insert the segment at
     * @param segment - The segment to insert
     */
    sharedStringWithInterception.insertAtReferencePosition = (
        pos: MergeTree.ReferencePosition,
        segment: MergeTree.TextSegment) => {
        context.hostRuntime.orderSequentially(() => {
            segment.properties = propertyInterceptionCallback(segment.properties);
            sharedString.insertAtReferencePosition(pos, segment);
        });
    };

    return sharedStringWithInterception as SharedString;
}
