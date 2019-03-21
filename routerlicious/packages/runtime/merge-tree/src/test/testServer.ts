// tslint:disable
import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { Client } from "../client";
import { ClientSeq, compareNumbers, clientSeqComparer, useCheckQ } from "../mergeTree";
import * as Collections from "../collections";
import * as Properties from "../properties";
import { IMergeTreeOp } from "../ops";
import { specToSegment } from "./testUtils";

/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.
 */
export class TestServer extends Client {
    seq = 1;
    clients: Client[];
    listeners: Client[]; // listeners do not generate edits
    clientSeqNumbers: Collections.Heap<ClientSeq>;
    upstreamMap: Collections.RedBlackTree<number, number>;
    constructor(initText: string, options?: Properties.PropertySet) {
        super(initText, specToSegment, options);
    }
    addUpstreamClients(upstreamClients: Client[]) {
        // assumes addClients already called
        this.upstreamMap = new Collections.RedBlackTree<number, number>(compareNumbers);
        for (let upstreamClient of upstreamClients) {
            this.clientSeqNumbers.add({
                refSeq: upstreamClient.getCurrentSeq(),
                clientId: upstreamClient.longClientId
            });
        }
    }
    addClients(clients: Client[]) {
        this.clientSeqNumbers = new Collections.Heap<ClientSeq>([], clientSeqComparer);
        this.clients = clients;
        for (let client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.longClientId });
        }
    }
    addListeners(listeners: Client[]) {
        this.listeners = listeners;
    }
    applyMsg(msg: ISequencedDocumentMessage) {
        this.applyRemoteOp({
            local: msg.clientId === this.longClientId,
            op: msg.contents as IMergeTreeOp,
            sequencedMessage: msg,
        });
        if (useCheckQ) {
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
}

/**
 * Used for in-memory testing.  This will queue a reference string for each client message.
 */
export function checkTextMatchRelative(refSeq: number, clientId: number, server: TestServer,
    msg: ISequencedDocumentMessage) {
    let client = server.clients[clientId];
    let serverText = server.mergeTree.getText(refSeq, clientId);
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