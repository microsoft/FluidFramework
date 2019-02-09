// tslint:disable:whitespace align no-bitwise
import * as MergeTree from "@prague/merge-tree";
import {
    IDistributedObjectServices,
    IRuntime,
} from "@prague/runtime-definitions";
import {
    CollaborativeStringExtension,
} from "./extension";
import {
    SegmentSequence,
} from "./sequence";

export type SharedStringSegment = MergeTree.TextSegment | MergeTree.Marker | MergeTree.ExternalSegment;
type SharedStringJSONSegment = MergeTree.IJSONTextSegment & MergeTree.IJSONMarkerSegment;

function textsToSegments(texts: SharedStringJSONSegment[]) {
    const segments: MergeTree.ISegment[] = [];
    for (const ptext of texts) {
        let segment: MergeTree.ISegment;
        if (ptext.text !== undefined) {
            segment = MergeTree.TextSegment.make(ptext.text, ptext.props as MergeTree.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        } else {
            // for now assume marker
            segment = MergeTree.Marker.make(
                ptext.marker.refType,
                ptext.props as MergeTree.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        }
        segments.push(segment);
    }
    return segments;
}

export class SharedString extends SegmentSequence<SharedStringSegment> {
    constructor(
        document: IRuntime,
        public id: string,
        sequenceNumber: number,
        services?: IDistributedObjectServices) {

        super(document, id, sequenceNumber, CollaborativeStringExtension.Type, services);
    }

    public appendSegment(segSpec: SharedStringJSONSegment) {
        const mergeTree = this.client.mergeTree;
        const pos = mergeTree.root.cachedLength;

        if (segSpec.text) {
            mergeTree.insertText(pos, MergeTree.UniversalSequenceNumber,
                mergeTree.collabWindow.clientId, MergeTree.UniversalSequenceNumber, segSpec.text,
                segSpec.props as MergeTree.PropertySet);
        } else {
            // assume marker for now
            mergeTree.insertMarker(pos, MergeTree.UniversalSequenceNumber, mergeTree.collabWindow.clientId,
                MergeTree.UniversalSequenceNumber, segSpec.marker.refType, segSpec.props as MergeTree.PropertySet);
        }

    }

    public segmentsFromSpecs(segSpecs: SharedStringJSONSegment[]) {
        return textsToSegments(segSpecs);
    }

    public insertMarkerRelative(relativePos1: MergeTree.IRelativePosition,
        refType: MergeTree.ReferenceType, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            marker: { refType },
            props,
            relativePos1,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
        this.client.insertMarkerLocal(pos, refType, props);
        this.submitIfAttached(insertMessage);

    }

    public insertMarker(
        pos: number,
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet) {

        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            marker: { refType },
            pos1: pos,
            props,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.insertMarkerLocal(pos, refType, props);
        this.submitIfAttached(insertMessage);
    }

    public getText(start?: number, end?: number): string {
        return this.client.getText(start, end);
    }

    public insertTextRelative(relativePos1: MergeTree.IRelativePosition, text: string, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            props,
            relativePos1,
            text,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
        this.client.insertTextLocal(text, pos, props);
        this.submitIfAttached(insertMessage);
    }

    public insertText(text: string, pos: number, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            props,
            text,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.insertTextLocal(text, pos, props);
        this.submitIfAttached(insertMessage);
    }

    public replaceText(text: string, start: number, end: number, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: start,
            pos2: end,
            props,
            text,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };
        this.client.mergeTree.startGroupOperation();
        this.client.removeSegmentLocal(start, end);
        this.client.insertTextLocal(text, start, props);
        this.client.mergeTree.endGroupOperation();
        this.submitIfAttached(insertMessage);
    }

    public removeNest(nestStart: MergeTree.Marker, nestEnd: MergeTree.Marker) {
        const start = this.client.mergeTree.getOffset(nestStart,
            MergeTree.UniversalSequenceNumber, this.client.getClientId());
        const end = nestEnd.cachedLength + this.client.mergeTree.getOffset(nestEnd,
            MergeTree.UniversalSequenceNumber, this.client.getClientId());
        console.log(`removing nest ${nestStart.getId()} from [${start},${end})`);
        const removeMessage: MergeTree.IMergeTreeRemoveMsg = {
            checkNest: { id1: nestStart.getId(), id2: nestEnd.getId() },
            pos1: start,
            pos2: end,
            type: MergeTree.MergeTreeDeltaType.REMOVE,
        };
        this.client.removeSegmentLocal(start, end);
        this.submitIfAttached(removeMessage);
    }

    public removeText(start: number, end: number) {
        this.removeRange(start, end);
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

    public annotateMarkerNotifyConsensus(marker: MergeTree.Marker, props: MergeTree.PropertySet,
        callback: (m: MergeTree.Marker) => void) {
        const id = marker.getId();
        const annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
            combiningOp: { name: "consensus" },
            props,
            relativePos1: { id, before: true },
            relativePos2: { id },
            type: MergeTree.MergeTreeDeltaType.ANNOTATE,
        };
        this.client.annotateMarkerNotifyConsensus(marker, props, callback);
        this.submitIfAttached(annotateMessage);
    }

    public annotateMarker(props: MergeTree.PropertySet, marker: MergeTree.Marker, op?: MergeTree.ICombiningOp) {
        const id = marker.getId();
        const annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
            props,
            relativePos1: { id, before: true },
            relativePos2: { id },
            type: MergeTree.MergeTreeDeltaType.ANNOTATE,
        };

        if (op) {
            annotateMessage.combiningOp = op;
        }
        this.client.annotateMarker(props, marker, op);
        this.submitIfAttached(annotateMessage);
    }

    public findTile(startPos: number, tileLabel: string, preceding = true) {
        return this.client.findTile(startPos, tileLabel, preceding);
    }
}
