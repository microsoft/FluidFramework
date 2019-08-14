/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@prague/protocol-definitions";
import { MockStorage } from "@prague/runtime-test-utils";
import { DebugLogger } from "@prague/utils";
import * as assert from "assert";
import * as random from "random-js";
import { Client } from "../client";
import * as Collections from "../collections";
import {
    ISegment,
    Marker,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
} from "../mergeTree";
import { createInsertSegmentOp } from "../opBuilder";
import { IMarkerDef, IMergeTreeOp, MergeTreeDeltaType, ReferenceType } from "../ops";
import { PropertySet } from "../properties";
import { Snapshot } from "../snapshot";
import { MergeTreeTextHelper, TextSegment } from "../textSegment";
import { nodeOrdinalsHaveIntegrity } from "./testUtils";

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

const mt = random.engines.mt19937();
mt.seedWithArray([0xDEADBEEF, 0xFEEDBED]);

export class TestClient extends Client {

    public static searchChunkSize = 256;

    /**
     * Used for in-memory testing.  This will queue a reference string for each client message.
     */
    public static useCheckQ = false;

    public static async createFromSnapshot(client1: TestClient): Promise<TestClient> {
        const snapshot = new Snapshot(client1.mergeTree, DebugLogger.create("prague:snapshot"));
        snapshot.extractSync();
        const snapshotTree = snapshot.emit();
        const services = new MockStorage(snapshotTree);

        const client2 = new TestClient(client1.mergeTree.options);

        const headerChunk = await Snapshot.loadChunk(services, "header");
        client2.mergeTree.reloadFromSegments(headerChunk.segmentTexts.map(specToSegment));
        assert.equal(client2.getText(), client1.getText(0, Snapshot.sizeOfFirstChunk));

        if (client1.getLength() > Snapshot.sizeOfFirstChunk) {

            const bodyChunk = await Snapshot.loadChunk(services, "body");
            client2.mergeTree.insertSegments(
                client2.getLength(),
                bodyChunk.segmentTexts.map(specToSegment),
                UniversalSequenceNumber,
                client2.mergeTree.collabWindow.clientId,
                UniversalSequenceNumber,
                undefined);

            assert.equal(client2.getLength(), client1.getLength());
            assert.equal(client2.getText(), client1.getText());
        }
        return client2;
    }

    public readonly checkQ: Collections.List<string> = Collections.ListMakeHead<string>();
    protected readonly q: Collections.List<ISequencedDocumentMessage> =
        Collections.ListMakeHead<ISequencedDocumentMessage>();

    private readonly textHelper: MergeTreeTextHelper;
    constructor(
        options?: PropertySet,
        ...handlers: Array<(spec: any) => ISegment>) {
        super(
            (spec: any) => {
                for (const handler of handlers.concat(specToSegment)) {
                    const segment = handler(spec);
                    if (segment) {
                        return segment;
                    }
                }
            },
        DebugLogger.create("prague:testClient"),
        options);
        this.textHelper = new MergeTreeTextHelper(this.mergeTree);

        // validate by default
        this.mergeTree.mergeTreeDeltaCallback = (o, d) => {
            // assert.notEqual(d.deltaSegments.length, 0);
            d.deltaSegments.forEach((s) => {
                if (d.operation === MergeTreeDeltaType.INSERT) {
                    assert.notEqual(s.segment.parent, undefined);
                }
            });
        };
    }

    public getText(start?: number, end?: number): string {
        return this.textHelper.getText(this.getCurrentSeq(), this.getClientId(), "", start, end);
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
        longClientId: string,
    ) {
        const segment = new TextSegment(text);
        if (props) {
            segment.addProperties(props);
        }
        this.applyMsg(this.makeOpMessage(
            createInsertSegmentOp(pos, segment),
            seq,
            refSeq,
            longClientId));
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
        longClientId: string,
    ) {
        const segment = new Marker(markerDef.refType);
        if (props) {
            segment.addProperties(props);
        }
        this.applyMsg(this.makeOpMessage(
            createInsertSegmentOp(pos, segment),
            seq,
            refSeq,
            longClientId));
    }

    public relText(clientId: number, refSeq: number) {
        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ${this.textHelper.getText(refSeq, clientId)}`;
    }

    public makeOpMessage(
        op: IMergeTreeOp,
        seq: number = UnassignedSequenceNumber,
        refSeq: number = this.getCurrentSeq(),
        longClientId?: string,
        minSeqNumber = 0) {
        const msg: ISequencedDocumentMessage = {
            clientId: longClientId === undefined ? this.longClientId : longClientId,
            clientSequenceNumber: 1,
            contents: op,
            minimumSequenceNumber: minSeqNumber,
            origin: null,
            referenceSequenceNumber: refSeq,
            sequenceNumber: seq,
            timestamp: Date.now(),
            traces: [],
            type: MessageType.Operation,
        };
        return msg;
    }

    public validate() {
        assert(nodeOrdinalsHaveIntegrity(this.mergeTree.root));
    }

    public searchFromPos(pos: number, target: RegExp) {
        let start = pos;
        let chunk = "";
        while (start < this.getLength()) {
            chunk = this.getText(start, start + TestClient.searchChunkSize);

            const result = chunk.match(target);
            if (result !== null) {
                return { text: result[0], pos: (result.index + start) };
            }
            start += TestClient.searchChunkSize;
        }
    }

    public findRandomWord() {
        const len = this.getLength();
        const pos = random.integer(0, len)(mt);
        const nextWord = this.searchFromPos(pos, /\s\w+\b/);
        return nextWord;
    }
}
