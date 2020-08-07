/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage, ITree, MessageType } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
// eslint-disable-next-line import/no-extraneous-dependencies
import { MockStorage } from "@fluidframework/test-runtime-utils";
// eslint-disable-next-line import/no-extraneous-dependencies
import random from "random-js";
import { Client } from "../client";
import * as Collections from "../collections";
import { UnassignedSequenceNumber } from "../constants";
import { ISegment, Marker, MergeTree } from "../mergeTree";
import { createInsertSegmentOp, createRemoveRangeOp } from "../opBuilder";
import { IJSONSegment, IMarkerDef, IMergeTreeOp, MergeTreeDeltaType, ReferenceType } from "../ops";
import { PropertySet } from "../properties";
import { SnapshotLegacy } from "../snapshotlegacy";
import { MergeTreeTextHelper, TextSegment } from "../textSegment";
import { nodeOrdinalsHaveIntegrity } from "./testUtils";

export function specToSegment(spec: IJSONSegment): ISegment {
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

    public static async createFromClientSnapshot(client1: TestClient, newLongClientId: string): Promise<TestClient> {
        const snapshot = new SnapshotLegacy(client1.mergeTree, DebugLogger.create("fluid:snapshot"));
        snapshot.extractSync();
        const snapshotTree = snapshot.emit([]);
        return TestClient.createFromSnapshot(snapshotTree, newLongClientId, client1.specToSegment);
    }

    public static async createFromSnapshot(
        snapshotTree: ITree,
        newLongClientId: string,
        specToSeg: (spec: IJSONSegment) => ISegment): Promise<TestClient> {
        const services = new MockStorage(snapshotTree);

        const client2 = new TestClient(undefined, specToSeg);
        const { catchupOpsP } = await client2.load(
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            {
                logger: client2.logger,
                clientId: newLongClientId,
            } as IFluidDataStoreRuntime,
            services);
        await catchupOpsP;
        return client2;
    }

    public mergeTree: MergeTree;

    public readonly checkQ: Collections.List<string> = Collections.ListMakeHead<string>();
    // eslint-disable-next-line max-len
    protected readonly q: Collections.List<ISequencedDocumentMessage> = Collections.ListMakeHead<ISequencedDocumentMessage>();

    private readonly textHelper: MergeTreeTextHelper;
    constructor(
        options?: PropertySet,
        specToSeg = specToSegment) {
        super(
            specToSeg,
            DebugLogger.create("fluid:testClient"),
            options);
        this.textHelper = new MergeTreeTextHelper(this.mergeTree);

        // Validate by default
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
        props: PropertySet | undefined,
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

    public removeRangeRemote(
        start: number,
        end: number,
        seq: number,
        refSeq: number,
        longClientId: string,
    ) {
        this.applyMsg(this.makeOpMessage(
            createRemoveRangeOp(start, end),
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
            metadata: undefined,
            minimumSequenceNumber: minSeqNumber,
            origin: null,
            referenceSequenceNumber: refSeq,
            sequenceNumber: seq,
            timestamp: Date.now(),
            term: 1,
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

            // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
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
