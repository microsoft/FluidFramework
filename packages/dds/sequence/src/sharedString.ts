/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICombiningOp,
    IMergeTreeInsertMsg,
    IMergeTreeRemoveMsg,
    IMergeTreeTextHelper,
    IRelativePosition,
    ISegment,
    Marker,
    PropertySet,
    ReferencePosition,
    ReferenceType,
    TextSegment,
} from "@fluidframework/merge-tree";
import { IFluidDataStoreRuntime, IChannelAttributes } from "@fluidframework/datastore-definitions";
import { SharedSegmentSequence } from "./sequence";
import { SharedStringFactory } from "./sequenceFactory";

/**
 * Fluid object interface describing access methods on a SharedString
 */
export interface ISharedString extends SharedSegmentSequence<SharedStringSegment> {
    /**
     * Inserts the text at the position.
     * @param pos - The position to insert the text at
     * @param text - The text to insert
     * @param props - The properties of the text
     */
    insertText(pos: number, text: string, props?: PropertySet): void;

    /**
     * Inserts a marker at the position.
     * @param pos - The position to insert the marker at
     * @param refType - The reference type of the marker
     * @param props - The properties of the marker
     */
    insertMarker(pos: number, refType: ReferenceType, props?: PropertySet): IMergeTreeInsertMsg;

    /**
     * {@inheritDoc SharedSegmentSequence.posFromRelativePos}
     */
    posFromRelativePos(relativePos: IRelativePosition): number;
}

export type SharedStringSegment = TextSegment | Marker;

/**
 * The Shared String is a specialized data structure for handling collaborative
 * text. It is based on a more general Sequence data structure but has
 * additional features that make working with text easier.
 *
 * In addition to text, a Shared String can also contain markers. Markers can be
 * used to store metadata at positions within the text, like the details of an
 * image or Fluid object that should be rendered with the text.
 *
 */
export class SharedString extends SharedSegmentSequence<SharedStringSegment> implements ISharedString {
    /**
     * Create a new shared string.
     * @param runtime - data store runtime the new shared string belongs to
     * @param id - optional name of the shared string
     * @returns newly create shared string (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedStringFactory.Type) as SharedString;
    }

    /**
     * Get a factory for SharedString to register with the data store.
     * @returns a factory that creates and load SharedString
     */
    public static getFactory() {
        return new SharedStringFactory();
    }

    public get ISharedString(): ISharedString {
        return this;
    }

    private readonly mergeTreeTextHelper: IMergeTreeTextHelper;

    constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, SharedStringFactory.segmentFromSpec);
        this.mergeTreeTextHelper = this.client.createTextHelper();
    }

    /**
     * Inserts a marker at a relative position.
     * @param relativePos1 - The relative position to insert the marker at
     * @param refType - The reference type of the marker
     * @param props - The properties of the marker
     */
    public insertMarkerRelative(
        relativePos1: IRelativePosition,
        refType: ReferenceType,
        props?: PropertySet) {
        const segment = new Marker(refType);
        if (props) {
            segment.addProperties(props);
        }

        const pos = this.posFromRelativePos(relativePos1);
        const insertOp = this.client.insertSegmentLocal(pos, segment);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
    }

    /**
     * {@inheritDoc ISharedString.insertMarker}
     */
    public insertMarker(
        pos: number,
        refType: ReferenceType,
        props?: PropertySet): IMergeTreeInsertMsg {
        const segment = new Marker(refType);
        if (props) {
            segment.addProperties(props);
        }

        const insertOp = this.client.insertSegmentLocal(pos, segment);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
        return insertOp;
    }

    /**
     * Inserts the text at the position.
     * @param relativePos1 - The relative position to insert the text at
     * @param text - The text to insert
     * @param props - The properties of text
     */
    public insertTextRelative(relativePos1: IRelativePosition, text: string, props?: PropertySet) {
        const segment = new TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }

        const pos = this.posFromRelativePos(relativePos1);
        const insertOp = this.client.insertSegmentLocal(pos, segment);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
    }

    /**
     * {@inheritDoc ISharedString.insertText}
     */
    public insertText(pos: number, text: string, props?: PropertySet) {
        const segment = new TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }

        const insertOp = this.client.insertSegmentLocal(pos, segment);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
    }

    /**
     * Replaces a range with the provided text.
     * @param start - The inclusive start of the range to replace
     * @param end - The exclusive end of the range to replace
     * @param text - The text to replace the range with
     * @param props - Optional. The properties of the replacement text
     */
    public replaceText(start: number, end: number, text: string, props?: PropertySet) {
        this.replaceRange(start, end, TextSegment.make(text, props));
    }

    /**
     * Removes the text in the given range.
     * @param start - The inclusive start of the range to remove
     * @param end - The exclusive end of the range to replace
     * @returns the message sent.
     */
    public removeText(start: number, end: number): IMergeTreeRemoveMsg {
        return this.removeRange(start, end);
    }

    /**
     * Annotates the marker with the provided properties and calls the callback on consensus.
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param consensusCallback - The callback called when consensus is reached
     */
    public annotateMarkerNotifyConsensus(
        marker: Marker,
        props: PropertySet,
        callback: (m: Marker) => void) {
        const annotateOp = this.client.annotateMarkerNotifyConsensus(marker, props, callback);
        if (annotateOp) {
            this.submitSequenceMessage(annotateOp);
        }
    }

    /**
     * Annotates the marker with the provided properties.
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     */
    public annotateMarker(
        marker: Marker,
        props: PropertySet,
        combiningOp?: ICombiningOp) {
        const annotateOp = this.client.annotateMarker(marker, props, combiningOp);
        if (annotateOp) {
            this.submitSequenceMessage(annotateOp);
        }
    }

    public findTile(startPos: number | undefined, tileLabel: string, preceding = true): {
        tile: ReferencePosition;
        pos: number;
    } {
        return this.client.findTile(startPos, tileLabel, preceding);
    }

    /**
     * @deprecated Use the free function {@link getTextAndMarkers} exported by this package instead.
     */
    public getTextAndMarkers(label: string) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getTextAndMarkers(segmentWindow.currentSeq, segmentWindow.clientId, label);
    }

    /**
     * Retrieve text from the SharedString in string format.
     * @param start - The starting index of the text to retrieve, or 0 if omitted.
     * @param end - The ending index of the text to retrieve, or the end of the string if omitted
     * @returns The requested text content as a string.
     */
    public getText(start?: number, end?: number) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, "", start, end);
    }

    /**
     * Adds spaces for markers and handles, so that position calculations account for them.
     */
    public getTextWithPlaceholders(start?: number, end?: number) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, " ", start, end);
    }

    /**
     * @deprecated Use {@link SharedString.getTextWithPlaceholders} instead.
     */
    public getTextRangeWithPlaceholders(start: number, end: number) {
        return this.getTextWithPlaceholders(start, end);
    }

    public getTextRangeWithMarkers(start: number, end: number) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, "*", start, end);
    }

    public getMarkerFromId(id: string): ISegment {
        return this.client.getMarkerFromId(id);
    }

    /**
     * Revert an op
     */
    protected rollback(content: any, localOpMetadata: unknown): void {
        if (this.client.rollback !== undefined) {
            this.client.rollback(content, localOpMetadata);
        } else {
            super.rollback(content, localOpMetadata);
        }
    }
}

/**
 * Splits the text into regions ending with markers with the given `label`.
 * @param sharedString - String to retrieve text and markers from
 * @param label - label to split on
 * @returns Two parallel lists of text and markers, split by markers with the provided `label`.
 *
 * For example:
 * ```typescript
 * // Say sharedstring has contents "hello<paragraph marker 1>world<paragraph marker 2>missing".
 * const { parallelText, parallelMarkers } = getTextAndMarkers(sharedString, "paragraph");
 * // parallelText === ["hello", "world"]
 * // parallelMarkers === [<paragraph marker 1 object>, <paragraph marker 2 object>]
 * // Note parallelText does not include "missing".
 * ```
 */
export function getTextAndMarkers(sharedString: SharedString, label: string): {
    parallelText: string[];
    parallelMarkers: Marker[];
} {
    return sharedString.getTextAndMarkers(label);
}
