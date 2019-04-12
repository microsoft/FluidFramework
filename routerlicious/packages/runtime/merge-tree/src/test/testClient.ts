import { ISequencedDocumentMessage, MessageType } from "@prague/container-definitions";
import { Client } from "../client";
import * as Collections from "../collections";
import { ISegment, Marker, TextSegment, UnassignedSequenceNumber } from "../mergeTree";
import { createInsertSegmentOp } from "../opBuilder";
import { IJSONSegment, IMarkerDef, IMergeTreeOp, ReferenceType } from "../ops";
import { PropertySet } from "../properties";

export function specToSegment(spec: any) {
    const maybeText = TextSegment.fromJSONObject(spec);
    if (maybeText) {
        return maybeText;
    }

    const maybeMarker = Marker.fromJSONObject(spec);
    if (maybeMarker) {
        return maybeMarker;
    }

    throw new Error(`Unrecognized IJSONSegment type: '${JSON.stringify(spec)}'`);
}

export class TestClient extends Client {
    /**
     * Used for in-memory testing.  This will queue a reference string for each client message.
     */
    public static useCheckQ = false;

    public readonly checkQ: Collections.List<string> = Collections.ListMakeHead<string>();
    protected readonly q: Collections.List<ISequencedDocumentMessage> =
        Collections.ListMakeHead<ISequencedDocumentMessage>();

    constructor(
        initText: string,
        options?: PropertySet,
        ...handlers: Array<(spec: any) => ISegment>) {
        super(
            initText,
            (spec: any) => {
                for (const handler of handlers.concat(specToSegment)) {
                    const segment = handler(spec);
                    if (segment) {
                        return segment;
                    }
                }
            },
        options);
    }

    public enqueueTestString() {
        this.checkQ.enqueue(this.getText());
    }
    public getMessageCount(): number {
        return this.q.count();
    }
    public enqueueMsg(msg: ISequencedDocumentMessage) {
        this.q.enqueue(msg);
    }
    public dequeueMsg(): ISequencedDocumentMessage {
        return this.q.dequeue();
    }
    public applyMessages(msgCount: number) {
        let currMsgCount = msgCount;
        while (currMsgCount > 0) {
            const msg = this.q.dequeue();
            if (msg) {
                this.applyMsg(msg);
            } else {
                break;
            }
            currMsgCount--;
        }

        return true;
    }

    public insertTextLocal(
        pos: number,
        text: string,
        props?: PropertySet,
    ) {
        const segment = new TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }
        return this.insertSegmentLocal(pos, segment);
    }

    public insertTextRemote(
        pos: number,
        text: string,
        props: PropertySet,
        seq: number,
        refSeq: number,
        clientId: number,
    ) {
        const segment = new TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }
        this.applyMsg(this.makeOpMessage(
            createInsertSegmentOp(pos, segment),
            seq,
            refSeq,
            clientId));
    }

    public insertMarkerLocal(
        pos: number,
        behaviors: ReferenceType,
        props?: PropertySet,
    ) {
        const segment = new Marker(behaviors);
        if (props) {
            segment.addProperties(props);
        }
        return this.insertSegmentLocal(pos, segment);
    }

    public insertMarkerRemote(
        pos: number,
        markerDef: IMarkerDef,
        props: PropertySet,
        seq: number,
        refSeq: number,
        clientId: number,
    ) {
        const segment = new Marker(markerDef.refType);
        if (props) {
            segment.addProperties(props);
        }
        this.applyMsg(this.makeOpMessage(
            createInsertSegmentOp(pos, segment),
            seq,
            refSeq,
            clientId));
    }

    public relText(clientId: number, refSeq: number) {
        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ${this.mergeTree.getText(refSeq, clientId)}`;
    }

    public makeOpMessage(
        op: IMergeTreeOp,
        seq: number = UnassignedSequenceNumber,
        refSeq: number = this.getCurrentSeq(),
        shortClientId?: number) {
        const msg: ISequencedDocumentMessage = {
            clientId: shortClientId === undefined ? this.longClientId : this.getLongClientId(shortClientId),
            clientSequenceNumber: 1,
            contents: op,
            minimumSequenceNumber: undefined,
            origin: null,
            referenceSequenceNumber: refSeq,
            sequenceNumber: seq,
            timestamp: Date.now(),
            traces: [],
            type: MessageType.Operation,
        };
        return msg;
    }
}
