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

    // short runs about 3s per seed, long runs about 4 mins per seed
    const long = false;
    const maxSeed = 10;
    // tslint:disable: mocha-no-side-effect-code
    const maxClients = long ? 128 : 16;
    const maxOpsPerRound = long ? 1024 : 128;
    const totalRounds = long ? 100 : 10;
    // tslint:enable: mocha-no-side-effect-code
    for (let j = 0; j < maxSeed; j++) {
        const annotate = true;
        it(`ConflictFarm_${j}`, async () => {
            const mt = random.engines.mt19937();
            mt.seedWithArray([0xDEADBEEF, 0xFEEDBED + j]);

            const clients: TestClient[] = [new TestClient({ blockUpdateMarkers: true })];
            clients.forEach(
                (c, i) => c.startCollaboration(String.fromCharCode("a".charCodeAt(0) + i)));

            let seq = 0;
            while (clients.length < maxClients) {
                clients.forEach((c) => c.updateMinSeq(seq));

                // Add double the number of clients each iteration
                const targetClients = clients.length * 2;
                for (let cc = clients.length; cc < targetClients; cc++) {
                    const newClient = await TestClient.createFromSnapshot(clients[0]);
                    clients.push(newClient);
                    newClient.startCollaboration(String.fromCharCode("a".charCodeAt(0) + cc), seq);
                }

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
                                if (!annotate || random.bool()(mt)) {
                                    op = client.removeRangeLocal(start, end);
                                } else {
                                    op = client.annotateRangeLocal(start, end, { bucket: i % 3 }, undefined);
                                }
                            }
                            if (op !== undefined) {
                                // Precheck to avoid logger.toString() in the string template
                                if (sg === client.mergeTree.pendingSegments.last()) {
                                    assert.notEqual(
                                        sg,
                                        client.mergeTree.pendingSegments.last(),
                                        `op created but segment group not enqueued.${logger}`);
                                }
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
    }
});
