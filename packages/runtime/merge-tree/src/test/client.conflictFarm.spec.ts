/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@prague/container-definitions";
import * as assert from "assert";
import * as random from "random-js";
import { TestClient } from ".";
import { IMergeTreeOp } from "..";

describe("MergeTree.Client", () => {

    it("ConflictFarm", () => {

        const clients: TestClient[] = new Array<TestClient>(5);
        for (let i = 0; i < clients.length; i++) {
            clients[i] = new TestClient();
            clients[i].startCollaboration(String.fromCharCode("a".charCodeAt(0) + i));
            clients[i].mergeTree.mergeTreeDeltaCallback = (o, d) => {
                if (d.deltaSegments.length > 0) {
                    d.deltaSegments.forEach((s) => {
                        assert.notEqual(s.segment.parent, undefined);
                    });
                }
            };
        }

        const mt = random.engines.mt19937();
        mt.seedWithArray([0xDEADBEEF, 0xFEEDBED]);

        let seq = 0;
        const iterationsPerRound = 10;
        for (let round = 0; round < 1000; round++) {
            const minimumSequenceNumber = seq;
            const logger = new RoundLogger(
                round,
                iterationsPerRound,
                minimumSequenceNumber,
                clients);
            const messages: ISequencedDocumentMessage[] = [];
            for (let iteration = 0; iteration < iterationsPerRound; iteration++) {
                // pick a client greater than 0, client 0 only applies remote ops
                // and is our baseline
                const client = clients[random.integer(1, clients.length - 1)(mt)];
                const len = client.getLength();
                const sg = client.mergeTree.pendingSegments.last();
                let op: IMergeTreeOp;
                if (len < 1) {
                    op = client.insertTextLocal(
                        random.integer(0, len)(mt),
                        client.longClientId.repeat(random.integer(0, 3)(mt)));
                } else {
                    const start = random.integer(0, len - 1)(mt);
                    const end = random.integer(start + 1, len)(mt);
                    op = client.removeRangeLocal(start, end);
                }
                if (op !== undefined) {
                    assert.notEqual(
                        sg,
                        client.mergeTree.pendingSegments.last(),
                        `op created but segment group not enqueued.
                        ${logger.toString()}`);
                    const message = client.makeOpMessage(op, ++seq);
                    message.minimumSequenceNumber = minimumSequenceNumber;
                    messages.push(message);
                }
            }
            // log and apply all the ops created in the round
            logger.log();
            while (messages.length > 0) {
                const message = messages.shift();
                logger.log(message, (c) => c.applyMsg(message));
            }

            // validate that all the clients match at the end of the round
            clients.forEach(
                (c) => assert.equal(
                    c.getText(),
                    clients[0].getText(),
                    `Client ${c.longClientId} does not match client a
                    ${ logger.toString()}`));
        }

    })
    // tslint:disable-next-line: mocha-no-side-effect-code
    .timeout(5 * 1000);

});

class RoundLogger {
    private readonly textPadding = 12;
    private readonly roundLogLines: string[][] = [];
    private readonly seqPad: number;

    constructor(
        round: number,
        interations: number,
        minSeq: number,
        private readonly clients: TestClient[]) {
        this.roundLogLines.push([`Round: ${round}`]);
        this.seqPad = Math.min(3, (minSeq + interations).toString().length);
        this.roundLogLines.push([
            "seq".padEnd(this.seqPad),
            "op",
            ...this.clients.map((c) => `client ${c.longClientId}`.padStart(this.textPadding)),
            ]);
    }

    public log(msg?: ISequencedDocumentMessage, preAction?: (c: TestClient) => void) {
        const seq = msg ? msg.sequenceNumber : -1;
        const opType = msg ? (msg.contents as IMergeTreeOp).type.toString() : "";
        const client = msg ? msg.clientId : "";
        const clientOp = `${client}${opType}`;
        const line: string[] = [
            seq.toString().padEnd(this.seqPad),
            clientOp.padEnd(2),
        ];
        this.roundLogLines.push(line);
        this.clients.forEach((c) => {
            if (preAction) {
                try {
                    preAction(c);
                } catch (e) {
                    // tslint:disable-next-line: no-unsafe-any
                    e.message += this.toString();
                    throw e;
                }
            }
            line.push(c.getText().padEnd(this.textPadding));
        });
    }

    public toString() {
        return `\n${this.roundLogLines.map((v) => v.join(" | ")).join("\n")}`;
    }
}
