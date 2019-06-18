import * as MergeTree from "@prague/merge-tree";
import {
    IComponentRuntime,
    ISharedObjectServices,
} from "@prague/runtime-definitions";
import {
    SharedStringExtension,
} from "./extension";
import {
    SharedSegmentSequence,
} from "./sequence";

export type SharedStringSegment = MergeTree.TextSegment | MergeTree.Marker | MergeTree.ExternalSegment;

export class SharedString extends SharedSegmentSequence<SharedStringSegment> {
    /**
     * Create a new shared string
     *
     * @param runtime - component runtime the new shared string belongs to
     * @param id - optional name of the shared string
     * @returns newly create shared string (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(SharedSegmentSequence.getIdForCreate(id),
            SharedStringExtension.Type) as SharedString;
    }

    /**
     * Get a factory for SharedString to register with the component.
     *
     * @returns a factory that creates and load SharedMap
     */
    public static getFactory() {
        return new SharedStringExtension();
    }

    private readonly mergeTreeTextHelper: MergeTree.MergeTreeTextHelper;

    constructor(
        document: IComponentRuntime,
        public id: string,
        services?: ISharedObjectServices) {

        super(document, id, SharedStringExtension.Type, services);
        this.mergeTreeTextHelper = new MergeTree.MergeTreeTextHelper(this.client.mergeTree);
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

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
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
     * @param relativePos1 - The  postition to insert the text at
     * @param text - The text to insert
     * @param props - The properties of text
     */
    public insertTextRelative(relativePos1: MergeTree.IRelativePosition, text: string, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
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
    public insertText(text: string, pos: number, props?: MergeTree.PropertySet) {
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
        const removeOp = this.client.removeRangeLocal(start, end);
        if (removeOp) {
            const segment = MergeTree.TextSegment.make(text, props);
            const insertOp = this.client.insertSegmentLocal(start, segment);
            this.submitSequenceMessage(MergeTree.createGroupOp(removeOp, insertOp));
        }
    }
    public removeText(start: number, end: number) {
        return this.removeRange(start, end);
    }

    public annotateRangeFromPast(
        props: MergeTree.PropertySet,
        start: number,
        end: number,
        fromSeq: number) {

        const ranges = this.client.mergeTree.tardisRange(start, end, fromSeq, this.client.getCurrentSeq(),
            this.client.getClientId());
        ranges.map((range: MergeTree.IIntegerRange) => {
            this.annotateRange(props, range.start, range.end);
        });
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
        const segmentWindow = this.client.mergeTree.getCollabWindow();
        return this.mergeTreeTextHelper.getTextAndMarkers(segmentWindow.currentSeq, segmentWindow.clientId, label);
    }
    public getText(start?: number, end?: number) {
        const segmentWindow = this.client.mergeTree.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, "", start, end);
    }
    /**
     * Adds spaces for markers and components, so that position calculations account for them
     */
    public getTextWithPlaceholders() {
        const segmentWindow = this.client.mergeTree.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, " ");
    }
    public getTextRangeWithPlaceholders(start: number, end: number) {
        const segmentWindow = this.client.mergeTree.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, " ", start, end);
    }
    public getTextRangeWithMarkers(start: number, end: number) {
        const segmentWindow = this.client.mergeTree.getCollabWindow();
        return this.mergeTreeTextHelper.getText(segmentWindow.currentSeq, segmentWindow.clientId, "*", start, end);
    }

    public segmentFromSpec(spec: any) {
        const maybeText = MergeTree.TextSegment.fromJSONObject(spec);
        if (maybeText) { return maybeText; }

        const maybeMarker = MergeTree.Marker.fromJSONObject(spec);
        if (maybeMarker) { return maybeMarker; }
    }
}
