// tslint:disable
import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { Client } from "../client";
import * as Collections from "../collections";
import { Marker, TextSegment, UnassignedSequenceNumber } from "../mergeTree";
import * as ops from "../ops";
import { makeOpMessage } from "./testUtils";


export class TestClient extends Client {
    /**
     * Used for in-memory testing.  This will queue a reference string for each client message.
     */
    public static useCheckQ = false;

    public readonly checkQ: Collections.List<string> = Collections.ListMakeHead<string>();
    protected readonly q = Collections.ListMakeHead<ISequencedDocumentMessage>();

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
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                this.applyMsg(msg);
            }
            else {
                break;
            }
            msgCount--;
        }

        return true;
    }

    // TODO: props, end
    public makeInsertMarkerMsg(refType: ops.ReferenceType, pos: number): ISequencedDocumentMessage {
        const contents: ops.IMergeTreeInsertMsg = {
            type: ops.MergeTreeDeltaType.INSERT, seg: new Marker(refType).toJSONObject(), pos1: pos
        };
        return makeOpMessage(contents, UnassignedSequenceNumber, this.getCurrentSeq(), this.longClientId);
    }
    public makeInsertMsg(text: string, pos: number, seq: number = UnassignedSequenceNumber, refSeq: number = this.getCurrentSeq()) {
        const contents: ops.IMergeTreeInsertMsg = {
            type: ops.MergeTreeDeltaType.INSERT, seg: new TextSegment(text).toJSONObject(), pos1: pos
        };
        return makeOpMessage(contents, seq, refSeq, this.longClientId);
    }
}
