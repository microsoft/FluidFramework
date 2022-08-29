/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import random from "random-js";
import { describeFuzz } from "@fluid-internal/stochastic-test-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeOp } from "../ops";
import { SegmentGroup } from "../mergeTreeNodes";
import {
    generateClientNames,
    doOverRange,
    runMergeTreeOperationRunner,
    annotateRange,
    removeRange,
    applyMessages,
    IMergeTreeOperationRunnerConfig,
    IConfigRange,
} from "./mergeTreeOperationRunner";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

function applyMessagesWithReconnect(
    startingSeq: number,
    messageDatas: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][],
    clients: readonly TestClient[],
    logger: TestClientLogger,
) {
    let seq = startingSeq;
    const reconnectClientMsgs: [IMergeTreeOp, SegmentGroup | SegmentGroup[]][] = [];
    let minSeq = 0;
    // log and apply all the ops created in the round
    while (messageDatas.length > 0) {
        const [message, sg] = messageDatas.shift()!;
        if (message.clientId === clients[1].longClientId) {
            reconnectClientMsgs.push([message.contents as IMergeTreeOp, sg]);
        } else {
            message.sequenceNumber = ++seq;
            clients.forEach((c) => c.applyMsg(message));
            minSeq = message.minimumSequenceNumber;
        }
    }

    const reconnectMsgs: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];
    reconnectClientMsgs.forEach((opData) => {
        const newMsg = clients[1].makeOpMessage(
            clients[1].regeneratePendingOp(
                opData[0],
                opData[1],
            ));
        newMsg.minimumSequenceNumber = minSeq;
        // apply message doesn't use the segment group, so just pass undefined
        reconnectMsgs.push([newMsg, undefined as any]);
    });

    return applyMessages(seq, reconnectMsgs, clients, logger);
}

interface IReconnectFarmConfig extends IMergeTreeOperationRunnerConfig {
    minLength: number;
    clients: IConfigRange;
}

export const defaultOptions: IReconnectFarmConfig = {
    minLength: 16,
    clients: { min: 2, max: 8 },
    opsPerRoundRange: { min: 40, max: 320 },
    rounds: 3,
    operations: [annotateRange, removeRange],
    growthFunc: (input: number) => input * 2,
};

// Generate a list of single character client names, support up to 69 clients
const clientNames = generateClientNames();

function runReconnectFarmTests(opts: IReconnectFarmConfig, extraSeed?: number): void {
    doOverRange(opts.clients, opts.growthFunc.bind(opts), (clientCount) => {
        it(`ReconnectFarm_${clientCount}`, async () => {
            const mt = random.engines.mt19937();
            const seedArray = [0xDEADBEEF, 0XFEEDBED, clientCount];
            if (extraSeed) {
                opts.resultsFilePostfix ??= "";
                opts.resultsFilePostfix += extraSeed;
                seedArray.push(extraSeed);
            }
            mt.seedWithArray(seedArray);

            const clients: TestClient[] = [new TestClient()];
            clients.forEach(
                (c, i) => c.startOrUpdateCollaboration(clientNames[i]));

            let seq = 0;
            clients.forEach((c) => c.updateMinSeq(seq));

            // Add double the number of clients each iteration
            const targetClients = Math.max(opts.clients.min, clientCount);
            for (let cc = clients.length; cc < targetClients; cc++) {
                const newClient = await TestClient.createFromClientSnapshot(clients[0], clientNames[cc]);
                clients.push(newClient);
            }

            seq = runMergeTreeOperationRunner(
                mt,
                seq,
                clients,
                opts.minLength,
                opts,
                applyMessagesWithReconnect);
        })
            .timeout(30 * 1000);
    });
}

describeFuzz("MergeTree.Client", ({ testCount }) => {
    const opts = defaultOptions;

    if (testCount > 1) {
        doOverRange({ min: 0, max: testCount - 1 }, (x) => x + 1, (seed) => {
            describe(`with seed ${seed}`, () => {
                runReconnectFarmTests(opts, seed);
            });
        });
    } else {
        runReconnectFarmTests(opts);
    }
});
