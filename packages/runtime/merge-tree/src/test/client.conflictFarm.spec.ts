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

interface IConflictFarmConfigRange {
    min: number;
    max: number;
}

interface IConflictFarmConfig {
    minLength: IConflictFarmConfigRange;
    clients: IConflictFarmConfigRange;
    rounds: number;
    opsPerRound: IConflictFarmConfigRange;
    annotate: boolean;
    incrementalLog: boolean;
    growthFunc(input: number): number;
}

export const debugOptions: IConflictFarmConfig = {
    minLength: {min: 2, max: 2},
    clients: {min: 3, max: 3},
    opsPerRound: { min: 1, max: 100 },
    rounds: 100,
    annotate: true,
    incrementalLog: true,
    growthFunc: (input: number) => input + 1,
};

export const defaultOptions: IConflictFarmConfig = {
    minLength: {min: 1, max: 512},
    clients: {min: 1, max: 8},
    opsPerRound: {min: 1, max: 128},
    rounds: 8,
    annotate: true,
    incrementalLog: false,
    growthFunc: (input: number) => input * 2,
};

export const longOptions: IConflictFarmConfig = {
    minLength: {min: 1, max: 512},
    clients: {min: 1, max: 32},
    opsPerRound: {min: 1, max: 512},
    rounds: 32,
    annotate: true,
    incrementalLog: true,
    growthFunc: (input: number) => input * 2,
};

function doOverRange(
    range: IConflictFarmConfigRange,
    growthFunc: (input: number) => number,
    doAction: (current: number) => void) {
    for (let current = range.min; current <= range.max; current = growthFunc(current)) {
        doAction(current);
    }
}

describe("MergeTree.Client", () => {

    // tslint:disable: mocha-no-side-effect-code
    const opts =
        defaultOptions;
        // debugOptions;

    // Generate a list of single character client names, support up to 69 clients
    const clientNames: string[] = [];
    function addClientNames(startChar: string, count: number) {
        const startCode = startChar.charCodeAt(0);
        for (let i = 0; i < count; i++) {
            clientNames.push(String.fromCharCode(startCode + i));
        }
    }

    addClientNames("A", 26);
    addClientNames("a", 26);
    addClientNames("0", 17);

    doOverRange(opts.minLength, opts.growthFunc, (minLength) => {
        // tslint:enable: mocha-no-side-effect-code
        it(`ConflictFarm_${minLength}`, async () => {
            const mt = random.engines.mt19937();
            mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, minLength]);

            const clients: TestClient[] = [new TestClient({ blockUpdateMarkers: true })];
            clients.forEach(
                (c, i) => c.startCollaboration(clientNames[i]));

            let seq = 0;
            while (clients.length < opts.clients.max) {
                clients.forEach((c) => c.updateMinSeq(seq));

                // Add double the number of clients each iteration
                const targetClients = Math.max(opts.clients.min, opts.growthFunc(clients.length));
                for (let cc = clients.length; cc < targetClients; cc++) {
                    const newClient = await TestClient.createFromClientSnapshot(clients[0], clientNames[cc]);
                    clients.push(newClient);
                }

                doOverRange(opts.opsPerRound, opts.growthFunc,  (opsPerRound) => {
                    if (opts.incrementalLog) {
                        // tslint:disable-next-line: max-line-length
                        console.log(`MinLength: ${minLength} Clients: ${clients.length} Ops: ${opsPerRound} Seq: ${seq}`);
                    }
                    for (let round = 0; round < opts.rounds; round++) {
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
                                if (!opts.annotate || random.bool()(mt)) {
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
                });
            }
        })
        // tslint:disable-next-line: mocha-no-side-effect-code
        .timeout(30 * 1000);
    });
});
