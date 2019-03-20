// tslint:disable:whitespace align no-bitwise
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

    public insertMarkerRelative(relativePos1: MergeTree.IRelativePosition,
        refType: MergeTree.ReferenceType, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.Marker(refType);
        if (props) {
            segment.addProperties(props);
        }
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            relativePos1,
            seg: segment.toJSONObject(),
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
        this.client.insertSegmentLocal(pos, segment, {op: insertMessage});
        this.submitIfAttached(insertMessage);
    }

    public insertMarker(
        pos: number,
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet) {

        const segment = new MergeTree.Marker(refType);
        if (props) {
            segment.addProperties(props);
        }
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            seg: segment.toJSONObject(),
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.insertSegmentLocal(pos, segment, {op: insertMessage});
        this.submitIfAttached(insertMessage);
    }

    public getText(start?: number, end?: number): string {
        return this.client.getText(start, end);
    }

    public insertTextRelative(relativePos1: MergeTree.IRelativePosition, text: string, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            relativePos1,
            seg: segment.toJSONObject(),
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
        this.client.insertSegmentLocal(pos, segment, {op: insertMessage});
        this.submitIfAttached(insertMessage);
    }

    public insertText(text: string, pos: number, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            seg: segment.toJSONObject(),
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.insertSegmentLocal(pos, segment, {op: insertMessage});
        this.submitIfAttached(insertMessage);
    }

    public replaceText(text: string, start: number, end: number, props?: MergeTree.PropertySet) {
        const segment = new MergeTree.TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: start,
            pos2: end,
            seg: segment.toJSONObject(),
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };
        this.client.mergeTree.startGroupOperation();
        this.client.removeSegmentLocal(start, end, {op: insertMessage});
        this.client.insertSegmentLocal(start, segment, {op: insertMessage});
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
        this.client.removeSegmentLocal(start, end, {op: removeMessage});
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
        this.client.annotateMarkerNotifyConsensus(marker, props, callback, {op: annotateMessage});
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
        this.client.annotateMarker(props, marker, op, {op: annotateMessage});
        this.submitIfAttached(annotateMessage);
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
