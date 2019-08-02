/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@prague/protocol-definitions";
import * as assert from "assert";
import * as random from "random-js";
import { TestClient } from ".";
import { IMergeTreeOp } from "..";
import { TestClientLogger } from "./testClientLogger";

describe("MergeTree.Client", () => {

    it("ConflictFarm", async () => {

        const clients: TestClient[] = [new TestClient()];
        clients[0].startCollaboration(String.fromCharCode("a".charCodeAt(0)));
        clients[0].mergeTree.mergeTreeDeltaCallback = (o, d) => {
            if (d.deltaSegments.length > 0) {
                d.deltaSegments.forEach((s) => {
                    assert.notEqual(s.segment.parent, undefined);
                });
            }
        };

        const mt = random.engines.mt19937();
        mt.seedWithArray([0xDEADBEEF, 0xFEEDBED]);
        // goal values maxClients: 100, maxOpsPerRound: 1000, totalRounds: 100
        const maxClients = 15;
        const maxOpsPerRound = 7;
        const totalRounds = 100;
        let seq = 0;
        for (let cc = clients.length; cc < maxClients; cc++) {
            clients.forEach((c) => c.updateMinSeq(seq));
            const newClient = await TestClient.createFromSnapshot(clients[0]);
            clients.push(newClient);
            newClient.startCollaboration(String.fromCharCode("a".charCodeAt(0) + cc), seq);

            for (let opsPerRound = 1; opsPerRound <= maxOpsPerRound; opsPerRound *= 2) {
                for (let round = 0; round < totalRounds; round++) {
                    const minimumSequenceNumber = seq;
                    let tempSeq = seq * -1;
                    const logger = new TestClientLogger(
                        clients,
                        `Clients: ${clients.length} Ops: ${opsPerRound} Round: ${round}`);
                    logger.log();
                    const messages: ISequencedDocumentMessage[] = [];
                    for (let i = 0; i < opsPerRound; i++) {
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
                            const message = client.makeOpMessage(op, --tempSeq);
                            message.minimumSequenceNumber = minimumSequenceNumber;
                            logger.log(message);
                            messages.push(message);
                        }
                    }
                    // log and apply all the ops created in the round
                    while (messages.length > 0) {
                        const message = messages.shift();
                        message.sequenceNumber = ++seq;
                        logger.log(message, (c) => c.applyMsg(message));
                    }

                    // validate that all the clients match at the end of the round
                    logger.validate();
                }
            }
        }

    })
    // tslint:disable-next-line: mocha-no-side-effect-code
    .timeout(10 * 1000);
});
