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
        }

        const mt = random.engines.mt19937();
        mt.seedWithArray([0xDEADBEEF, 0xFEEDBED]);

        let seq = 0;
        const messages: ISequencedDocumentMessage[] = [];
        const iterationsPerRound = 10;
        for (let round = 0; round < 1000; round++) {
            const minimumSequenceNumber = seq;
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
                        "op created but segment group not enqueued.");
                    const message = client.makeOpMessage(op, ++seq);
                    message.minimumSequenceNumber = minimumSequenceNumber;
                    messages.push(message);
                }
            }
            // log and apply all the ops created in the round
            const padding = 8;
            const roundText = [`Round: ${round}`];
            roundText.push(`  | ${clients.map((c) => `client ${c.longClientId}`.padStart(padding)).join(" | ")}`);
            roundText.push(`  | ${clients.map((c) => c.getText().padEnd(padding)).join(" | ")}`);
            while (messages.length > 0) {
                const message = messages.shift();
                clients.forEach((c) => c.applyMsg(message));
                roundText.push(
                    `${message.clientId} | ${clients.map((c) => c.getText().padEnd(padding)).join(" | ")}`);
            }

            // validate that all the clients match at the end of the round
            clients.forEach(
                (c) => assert.equal(
                    c.getText(),
                    clients[0].getText(),
                    `Client ${c.longClientId} does not match it client a\n${roundText.join("\n")}`));
        }

    })
    // tslint:disable-next-line: mocha-no-side-effect-code
    .timeout(5 * 1000);
});
