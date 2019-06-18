/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable
import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { ClientSeq, compareNumbers, clientSeqComparer, IncrementalMapState, ISegment, MergeTree, IncrementalExecOp } from "../mergeTree";
import * as Collections from "../collections";
import * as Properties from "../properties";
import { TestClient } from "./testClient";
import { MergeTreeTextHelper, TextSegment } from "../textSegment";
import { IIntegerRange } from "..";

/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.
 */
export class TestServer extends TestClient {
    seq = 1;
    clients: TestClient[];
    listeners: TestClient[]; // listeners do not generate edits
    clientSeqNumbers: Collections.Heap<ClientSeq>;
    upstreamMap: Collections.RedBlackTree<number, number>;
    constructor(options?: Properties.PropertySet) {
        super(options);
    }
    addUpstreamClients(upstreamClients: TestClient[]) {
        // assumes addClients already called
        this.upstreamMap = new Collections.RedBlackTree<number, number>(compareNumbers);
        for (let upstreamClient of upstreamClients) {
            this.clientSeqNumbers.add({
                refSeq: upstreamClient.getCurrentSeq(),
                clientId: upstreamClient.longClientId
            });
        }
    }
    addClients(clients: TestClient[]) {
        this.clientSeqNumbers = new Collections.Heap<ClientSeq>([], clientSeqComparer);
        this.clients = clients;
        for (let client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.longClientId });
        }
    }
    addListeners(listeners: TestClient[]) {
        this.listeners = listeners;
    }
    applyMsg(msg: ISequencedDocumentMessage) {
        super.applyMsg(msg);
        if (TestClient.useCheckQ) {
            let clid = this.getShortClientId(msg.clientId);
            return checkTextMatchRelative(msg.referenceSequenceNumber, clid, this, msg);
        }
        else {
            return false;
        }
    }
    // TODO: remove mappings when no longer needed using min seq
    // in upstream message
    transformUpstreamMessage(msg: ISequencedDocumentMessage) {
        if (msg.referenceSequenceNumber > 0) {
            msg.referenceSequenceNumber =
                this.upstreamMap.get(msg.referenceSequenceNumber).data;
        }
        msg.origin = {
            id: "A",
            sequenceNumber: msg.sequenceNumber,
            minimumSequenceNumber: msg.minimumSequenceNumber,
        };
        this.upstreamMap.put(msg.sequenceNumber, this.seq);
        msg.sequenceNumber = -1;
    }
    copyMsg(msg: ISequencedDocumentMessage) {
        return <ISequencedDocumentMessage>{
            clientId: msg.clientId,
            clientSequenceNumber: msg.clientSequenceNumber,
            contents: msg.contents,
            minimumSequenceNumber: msg.minimumSequenceNumber,
            referenceSequenceNumber: msg.referenceSequenceNumber,
            sequenceNumber: msg.sequenceNumber,
            type: msg.type
        };
    }
    applyMessages(msgCount: number) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                if (msg.sequenceNumber >= 0) {
                    this.transformUpstreamMessage(msg);
                }
                msg.sequenceNumber = this.seq++;
                if (this.applyMsg(msg)) {
                    return true;
                }
                if (this.clients) {
                    let minCli = this.clientSeqNumbers.peek();
                    if (minCli && (minCli.clientId == msg.clientId) &&
                        (minCli.refSeq < msg.referenceSequenceNumber)) {
                        let cliSeq = this.clientSeqNumbers.get();
                        let oldSeq = cliSeq.refSeq;
                        cliSeq.refSeq = msg.referenceSequenceNumber;
                        this.clientSeqNumbers.add(cliSeq);
                        minCli = this.clientSeqNumbers.peek();
                        if (minCli.refSeq > oldSeq) {
                            msg.minimumSequenceNumber = minCli.refSeq;
                            this.updateMinSeq(minCli.refSeq);
                        }
                    }
                    for (let client of this.clients) {
                        client.enqueueMsg(msg);
                    }
                    if (this.listeners) {
                        for (let listener of this.listeners) {
                            listener.enqueueMsg(this.copyMsg(msg));
                        }
                    }
                }
            }
            else {
                break;
            }
            msgCount--;
        }
        return false;
    }
    public incrementalGetText(start?: number, end?: number) {
        const range: IIntegerRange = {start, end};
        if (range.start === undefined) {
            range.start = 0;
        }
        if (range.end === undefined) {
            range.end = this.getLength();
        }
        const context = new TextSegment("");
        const stack = new Collections.Stack<IncrementalMapState<TextSegment>>();
        const initialState = new IncrementalMapState(
            this.mergeTree.root,
            { leaf: incrementalGatherText },
            0,
            this.getCurrentSeq(),
            this.getClientId(),
            context,
            range.start,
            range.end,
            0);
        stack.push(initialState);

        while (!stack.empty()) {
            this.mergeTree.incrementalBlockMap(stack);
        }
        return context.text;
    }
}

function incrementalGatherText(segment: ISegment, state: IncrementalMapState<TextSegment>) {
    if (TextSegment.is(segment)) {
        if (MergeTree.traceGatherText) {
            console.log(
                `@cli ${state.clientId ? state.clientId : -1} ` +
                `gather seg seq ${segment.seq} rseq ${segment.removedSeq} text ${segment.text}`);
        }
        if ((state.start <= 0) && (state.end >= segment.text.length)) {
            state.context.text += segment.text;
        } else {
            if (state.end >= segment.text.length) {
                state.context.text += segment.text.substring(state.start);
            } else {
                state.context.text += segment.text.substring(state.start, state.end);
            }
        }
    }
    state.op = IncrementalExecOp.Go;
}

/**
 * Used for in-memory testing.  This will queue a reference string for each client message.
 */
export function checkTextMatchRelative(refSeq: number, clientId: number, server: TestServer,
    msg: ISequencedDocumentMessage) {
    let client = server.clients[clientId];
    let serverText = new MergeTreeTextHelper(server.mergeTree).getText(refSeq, clientId);
    let cliText = client.checkQ.dequeue();
    if ((cliText === undefined) || (cliText != serverText)) {
        console.log(`mismatch `);
        console.log(msg);
        //        console.log(serverText);
        //        console.log(cliText);
        console.log(server.mergeTree.toString());
        console.log(client.mergeTree.toString());
        return true;
    }
    return false;
}