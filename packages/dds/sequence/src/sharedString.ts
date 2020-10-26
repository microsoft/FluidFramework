/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import { } from "@fluidframework/core-interfaces";
import * as MergeTree from "@fluidframework/merge-tree";
import { IFluidDataStoreRuntime, IChannelAttributes } from "@fluidframework/datastore-definitions";
import { SharedSegmentSequence } from "./sequence";
import { SharedStringFactory } from "./sequenceFactory";

/**
 * Fluid object interface describing access methods on a SharedString
 */
export interface ISharedString extends SharedSegmentSequence<SharedStringSegment> {
    insertText(pos: number, text: string, props?: MergeTree.PropertySet);

    insertMarker(pos: number, refType: MergeTree.ReferenceType, props?: MergeTree.PropertySet);

    posFromRelativePos(relativePos: MergeTree.IRelativePosition);
}

export type SharedStringSegment = MergeTree.TextSegment | MergeTree.Marker;

/**
 * The Shared String is a specialized data structure for handling collaborative
 *  text. It is based on a more general Sequence data structure but has
 * additional features that make working with text easier.
 *
 * In addition to text, a Shared String can also contain markers. Markers can be
 * used to store metadata at positions within the text, like the details of an
 * image or Fluid object that should be rendered with the text.
 *
 */
export class SharedString extends SharedSegmentSequence<SharedStringSegment> implements ISharedString {
    /**
     * Create a new shared string
     *
     * @param runtime - data store runtime the new shared string belongs to
     * @param id - optional name of the shared string
     * @returns newly create shared string (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedStringFactory.Type) as SharedString;
    }

    /**
     * Get a factory for SharedString to register with the data store.
     *
     * @returns a factory that creates and load SharedString
     */
    public static getFactory() {
        return new SharedStringFactory();
    }

    public get ISharedString(): ISharedString {
        return this;
    }

    private readonly mergeTreeTextHelper: MergeTree.MergeTreeTextHelper;

    constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, SharedStringFactory.segmentFromSpec);
        this.mergeTreeTextHelper = this.client.createTextHelper();
    }

    /**
     * Inserts a marker at a relative postition
     *
     * @param relativePos1 - The relative postition to insert the marker at
     * @param refType - The reference type of the marker
     * @param props - The properties of the marker
     */
    public insertMarkerRelative(
        relativePos1: MergeTree.IRelativePosition,
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet) {
        const segment = new MergeTree.Marker(refType);
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
     * Inserts a marker at the postition
     *
     * @param pos - The postition to insert the marker at
     * @param refType - The reference type of the marker
     * @param props - The properties of the marker
     */
    public insertMarker(
        pos: number,
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet) {
        const segment = new MergeTree.Marker(refType);
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
     * Inserts the text at the postition
     *
     * @param relativePos1 - The relative postition to insert the text at
     * @param text - The text to insert
     * @param props - The properties of text
     */
    public insertTextRelative(relativePos1: MergeTree.IRelativePosition, text: string, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
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
     * Inserts the text at the postition
     *
     * @param pos - The  postition to insert the text at
     * @param text - The text to insert
     * @param props - The properties of text
     */
    public insertText(pos: number, text: string, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
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
     *
     * @param start - The inclusive start of the range to replace
     * @param end - The exclusive end of the range to replace
     * @param text - The text to replace the range with
     * @param props - Optional. The properties of the replacement text
     */
    public replaceText(start: number, end: number, text: string, props?: MergeTree.PropertySet) {
        this.replaceRange(start, end, MergeTree.TextSegment.make(text, props));
    }

    public removeText(start: number, end: number) {
        return this.removeRange(start, end);
    }

    /**
     * Annotates the marker with the provided properties
     * and calls the callback on concensus.
     *
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param consensusCallback - The callback called when consensus is reached
     */
    public annotateMarkerNotifyConsensus(
        marker: MergeTree.Marker,
        props: MergeTree.PropertySet,
        callback: (m: MergeTree.Marker) => void) {
        const annotateOp = this.client.annotateMarkerNotifyConsensus(marker, props, callback);
        if (annotateOp) {
            this.submitSequenceMessage(annotateOp);
        }
    }

    /**
     * Annotates the marker with the provided properties
     *
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     */
    public annotateMarker(
        marker: MergeTree.Marker,
        props: MergeTree.PropertySet,
        combiningOp?: MergeTree.ICombiningOp) {
        const annotateOp = this.client.annotateMarker(marker, props, combiningOp);
        if (annotateOp) {
            this.submitSequenceMessage(annotateOp);
        }
    }

    public findTile(startPos: number | undefined, tileLabel: string, preceding = true) {
        return this.client.findTile(startPos, tileLabel, preceding);
    }

    public getTextAndMarkers(label: string) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getTextAndMarkers(segmentWindow.currentSeq, segmentWindow.clientId, label);
    }
    public getText(start?: number, end?: number) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, "", start, end);
    }
    /**
     * Adds spaces for markers and handles, so that position calculations account for them
     */
    public getTextWithPlaceholders() {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, " ");
    }
    public getTextRangeWithPlaceholders(start: number, end: number) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, " ", start, end);
    }
    public getTextRangeWithMarkers(start: number, end: number) {
        const segmentWindow = this.client.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, "*", start, end);
    }

    public getMarkerFromId(id: string) {
        return this.client.getMarkerFromId(id);
    }
}
