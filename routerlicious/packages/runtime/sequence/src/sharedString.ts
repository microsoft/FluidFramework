import * as MergeTree from "@prague/merge-tree";
import {
    IDistributedObjectServices,
    IRuntime,
} from "@prague/runtime-definitions";
import {
    SharedStringExtension,
} from "./extension";
import {
    SegmentSequence,
} from "./sequence";

export type SharedStringSegment = MergeTree.TextSegment | MergeTree.Marker | MergeTree.ExternalSegment;

export class SharedString extends SegmentSequence<SharedStringSegment> {
    constructor(
        document: IRuntime,
        public id: string,
        services?: IDistributedObjectServices) {

        super(document, id, SharedStringExtension.Type, services);
    }

    /**
     * Inserts a marker at a relative postition
     * @param relativePos1 The relative postition to insert the marker at
     * @param refType The reference type of the marker
     * @param props  The properties of the marker
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
            this.submitIfAttached(insertOp);
        }
    }

    /**
     * Inserts a marker at the postition
     * @param pos The  postition to insert the marker at
     * @param refType The reference type of the marker
     * @param props  The properties of the marker
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
            this.submitIfAttached(insertOp);
        }
        return insertOp;
    }

    public getText(start?: number, end?: number): string {
        return this.client.getText(start, end);
    }

    /**
     * Inserts the text at the postition
     * @param relativePos1 The  postition to insert the text at
     * @param text The text to insert
     * @param props  The properties of text
     */
    public insertTextRelative(relativePos1: MergeTree.IRelativePosition, text: string, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
        const insertOp = this.client.insertSegmentLocal(pos, segment);
        if (insertOp) {
            this.submitIfAttached(insertOp);
        }
    }

    /**
     * Inserts the text at the postition
     * @param pos The  postition to insert the text at
     * @param text The text to insert
     * @param props  The properties of text
     */
    public insertText(text: string, pos: number, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }

        const insertOp = this.client.insertSegmentLocal(pos, segment);
        if (insertOp) {
            this.submitIfAttached(insertOp);
        }
    }
    /**
     * Replaces a range with the provided text.
     *
     * @param start The inclusive start of the range to replace
     * @param end The exclusive end of the range to replace
     * @param text The text to replace the range with
     * @param props Optional. The properties of the replacement text
     */
    public replaceText(start: number, end: number, text: string, props?: MergeTree.PropertySet) {
        this.client.mergeTree.startGroupOperation();
        try {
            const removeOp = this.client.removeRangeLocal(start, end);
            if (removeOp) {
                const segment = MergeTree.TextSegment.make(text, props);
                this.client.insertSegmentLocal(start, segment);
                this.submitIfAttached(
                    MergeTree.createGroupOp(
                        removeOp,
                        MergeTree.createInsertSegmentOp(start, segment)));
            }
        } finally {
            this.client.mergeTree.endGroupOperation();
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
     * @param marker The marker to annotate
     * @param props The properties to annotate the marker with
     * @param consensusCallback The callback called when consensus is reached
     */
    public annotateMarkerNotifyConsensus(
        marker: MergeTree.Marker,
        props: MergeTree.PropertySet,
        callback: (m: MergeTree.Marker) => void) {

        const annotateOp = this.client.annotateMarkerNotifyConsensus(marker, props, callback);
        if (annotateOp) {
            this.submitIfAttached(annotateOp);
        }
    }

    /**
     * Annotates the marker with the provided properties
     * @param marker The marker to annotate
     * @param props The properties to annotate the marker with
     * @param combiningOp Optional. Specifies how to combine values for the property, such as "incr" for increment.
     */
    public annotateMarker(
        marker: MergeTree.Marker,
        props: MergeTree.PropertySet,
        combiningOp?: MergeTree.ICombiningOp) {
        const annotateOp = this.client.annotateMarker(marker, props, combiningOp);
        if (annotateOp) {
            this.submitIfAttached(annotateOp);
        }
    }

    public findTile(startPos: number, tileLabel: string, preceding = true) {
        return this.client.findTile(startPos, tileLabel, preceding);
    }

    protected segmentFromSpec(spec: any) {
        const maybeText = MergeTree.TextSegment.fromJSONObject(spec);
        if (maybeText) { return maybeText; }

        const maybeMarker = MergeTree.Marker.fromJSONObject(spec);
        if (maybeMarker) { return maybeMarker; }
    }
}
