/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@prague/protocol-definitions";
import * as assert from "assert";
import * as random from "random-js";
import { IMergeTreeOp } from "../ops";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

describe("MergeTree.Client", () => {
    /* enables:
        incremental logging
        incremental growth
        more rounds
    */
    const debug = false;
    // short runs about 3s per seed, long runs about 4 mins per seed
    const long = false;
    // tslint:disable: mocha-no-side-effect-code

    // Test config
    const maxMinLength = 512;
    const maxClients = long ? 32 : 8;
    const maxOpsPerRound = long ? 512 : 128;
    const totalRounds = (long ? 32 : 8) * (debug ? 10 : 1);
    const annotate = true;

    // control how many clients to start with for debugging
    const minClients = Math.min(maxClients, 1);

    // Generate a list of single character client names, support up to 69 clients
    const clientNames: string[] = [];
    function addClientNames(startChar: string, count: number) {
        const startCode = startChar.charCodeAt(0);
        for (let i = 0; i < count; i++) {
            clientNames.push(String.fromCharCode(startCode + i));
        }
    }

    const growthFunc = (input: number) => debug ? input + 1 : input * 2;

    addClientNames("A", 26);
    addClientNames("a", 26);
    addClientNames("0", 17);

    for (let minLength = 1; minLength <= maxMinLength; minLength = growthFunc(minLength)) {
        // tslint:enable: mocha-no-side-effect-code
        it(`ConflictFarm_${minLength}`, async () => {
            const mt = random.engines.mt19937();
            mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, minLength]);

            const clients: TestClient[] = [new TestClient({ blockUpdateMarkers: true })];
            clients.forEach(
                (c, i) => c.startCollaboration(clientNames[i]));

            let seq = 0;
            while (clients.length < maxClients) {
                clients.forEach((c) => c.updateMinSeq(seq));

                // Add double the number of clients each iteration
                const targetClients = Math.max(minClients, growthFunc(clients.length));
                for (let cc = clients.length; cc < targetClients; cc++) {
                    const newClient = await TestClient.createFromSnapshot(clients[0], clientNames[cc]);
                    clients.push(newClient);
                }

                for (let opsPerRound = 1; opsPerRound <= maxOpsPerRound; opsPerRound = growthFunc(opsPerRound)) {
                    if (long || debug) {
                        // tslint:disable-next-line: max-line-length
                        console.log(`MinLength: ${minLength} Clients: ${clients.length} Ops: ${opsPerRound} Seq: ${seq}`);
                    }
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
                            if (len < minLength) {
                                const pos = random.integer(0, len)(mt);
                                op = client.insertTextLocal(
                                    pos,
                                    client.longClientId.repeat(random.integer(1, 3)(mt)));

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
            .timeout(30 * 1000);
    }
});
