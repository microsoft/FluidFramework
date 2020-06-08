/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import random from "random-js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeOp } from "../ops";
import { SegmentGroup } from "../mergeTree";
import {
    generateClientNames,
    doOverRange,
    runMergeTreeOperationRunner,
    annotateRange,
    removeRange,
    applyMessages,
} from "./mergeTreeOperationRunner";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

export function applyReconnectWithReconnect(
    startingSeq: number,
    messageDatas: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][],
    clients: readonly TestClient[],
    logger: TestClientLogger,
    ) {
let seq = startingSeq;
    const reconnectClientMsgs: [IMergeTreeOp, SegmentGroup | SegmentGroup[]][] = [];
    // log and apply all the ops created in the round
    while (messageDatas.length > 0) {
        const [message, sg] = messageDatas.shift();
        if(message.clientId === clients[1].longClientId) {
            reconnectClientMsgs.push([message.contents as IMergeTreeOp, sg]);
        }else{
            message.sequenceNumber = ++seq;
            logger.log(message, (c) => {
                c.applyMsg(message);
            });
        }
    }

    const reconnectMsgs: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];
    reconnectClientMsgs.forEach((opData)=>{
        const newMsg = clients[1].makeOpMessage(
            clients[1].regeneratePendingOp(
                opData[0],
                opData[1],
        ));
        // apply message doesn't use the segment group, so just pass undefined
        reconnectMsgs.push([newMsg, undefined]);
    });

    return applyMessages(seq, reconnectMsgs, clients, logger);
}

export const defaultOptions = {
    minLength: 16,
    clients: { min: 2, max: 8 },
    opsPerRoundRange: { min: 200, max: 800 },
    rounds: 3,
    operations: [annotateRange, removeRange],
    growthFunc: (input: number) => input * 2,
};

describe("MergeTree.Client", () => {
    // tslint:disable: mocha-no-side-effect-code
    const opts = defaultOptions;

    // Generate a list of single character client names, support up to 69 clients
    const clientNames = generateClientNames();

    doOverRange(opts.clients, opts.growthFunc, (clientCount) => {
        // tslint:enable: mocha-no-side-effect-code
        it(`ReconnectFarm_${clientCount}`, async () => {
            const mt = random.engines.mt19937();
            mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, clientCount]);

            const clients: TestClient[] = [new TestClient({ blockUpdateMarkers: true })];
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
                applyReconnectWithReconnect);
        })
        // tslint:disable-next-line: mocha-no-side-effect-code
        .timeout(30 * 1000);
    });
});
