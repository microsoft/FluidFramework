/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IIntegerRange } from "../base";
import {
    Heap,
    RedBlackTree,
    Stack,
} from "../collections";
import {
    ClientSeq,
    clientSeqComparer,
    compareNumbers,
    IncrementalExecOp,
    IncrementalMapState,
    ISegment,
} from "../mergeTree";
import { PropertySet } from "../properties";
import { MergeTreeTextHelper, TextSegment } from "../textSegment";
import { TestClient } from "./testClient";

/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.
 */
export class TestServer extends TestClient {
    seq = 1;
    clients: TestClient[];
    listeners: TestClient[]; // Listeners do not generate edits
    clientSeqNumbers: Heap<ClientSeq>;
    upstreamMap: RedBlackTree<number, number>;
    constructor(options?: PropertySet) {
        super(options);
    }
    addUpstreamClients(upstreamClients: TestClient[]) {
        // Assumes addClients already called
        this.upstreamMap = new RedBlackTree<number, number>(compareNumbers);
        for (const upstreamClient of upstreamClients) {
            this.clientSeqNumbers.add({
                refSeq: upstreamClient.getCurrentSeq(),
                clientId: upstreamClient.longClientId,
            });
        }
    }
    addClients(clients: TestClient[]) {
        this.clientSeqNumbers = new Heap<ClientSeq>([], clientSeqComparer);
        this.clients = clients;
        for (const client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.longClientId });
        }
    }
    addListeners(listeners: TestClient[]) {
        this.listeners = listeners;
    }
    applyMsg(msg: ISequencedDocumentMessage) {
        super.applyMsg(msg);
        if (TestClient.useCheckQ) {
            const clid = this.getShortClientId(msg.clientId);
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
        return {
            clientId: msg.clientId,
            clientSequenceNumber: msg.clientSequenceNumber,
            contents: msg.contents,
            minimumSequenceNumber: msg.minimumSequenceNumber,
            referenceSequenceNumber: msg.referenceSequenceNumber,
            sequenceNumber: msg.sequenceNumber,
            type: msg.type,
        } as ISequencedDocumentMessage;
    }

    private minSeq = 0;

    applyMessages(msgCount: number) {
        let _msgCount = msgCount;
        while (_msgCount > 0) {
            const msg = this.q.dequeue();
            if (msg) {
                if (msg.sequenceNumber >= 0) {
                    this.transformUpstreamMessage(msg);
                }
                msg.sequenceNumber = this.seq++;
                msg.minimumSequenceNumber = this.minSeq;
                if (this.applyMsg(msg)) {
                    return true;
                }
                if (this.clients) {
                    let minCli = this.clientSeqNumbers.peek();
                    // eslint-disable-next-line eqeqeq
                    if (minCli && (minCli.clientId == msg.clientId) &&
                        (minCli.refSeq < msg.referenceSequenceNumber)) {
                        const cliSeq = this.clientSeqNumbers.get();
                        const oldSeq = cliSeq.refSeq;
                        cliSeq.refSeq = msg.referenceSequenceNumber;
                        this.clientSeqNumbers.add(cliSeq);
                        minCli = this.clientSeqNumbers.peek();
                        if (minCli.refSeq > oldSeq) {
                            msg.minimumSequenceNumber = minCli.refSeq;
                            this.minSeq = minCli.refSeq;
                        }
                    }
                    for (const client of this.clients) {
                        client.enqueueMsg(msg);
                    }
                    if (this.listeners) {
                        for (const listener of this.listeners) {
                            listener.enqueueMsg(this.copyMsg(msg));
                        }
                    }
                }
            }
            else {
                break;
            }
            _msgCount--;
        }
        return false;
    }
    public incrementalGetText(start?: number, end?: number) {
        const range: IIntegerRange = { start, end };
        if (range.start === undefined) {
            range.start = 0;
        }
        if (range.end === undefined) {
            range.end = this.getLength();
        }
        const context = new TextSegment("");
        const stack = new Stack<IncrementalMapState<TextSegment>>();
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
export function checkTextMatchRelative(
    refSeq: number,
    clientId: number,
    server: TestServer,
    msg: ISequencedDocumentMessage) {
    const client = server.clients[clientId];
    const serverText = new MergeTreeTextHelper(server.mergeTree).getText(refSeq, clientId);
    const cliText = client.checkQ.dequeue();
    // eslint-disable-next-line eqeqeq
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
