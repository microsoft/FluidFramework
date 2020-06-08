/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import random from "random-js";
import {
    annotateRange,
    doOverRange,
    IConfigRange,
    IMergeTreeOperationRunnerConfig,
    insertAtRefPos,
    removeRange,
    runMergeTreeOperationRunner,
    TestOperation,
} from "./mergeTreeOperationRunner";
import { TestClient } from "./testClient";

interface IConflictFarmConfig extends IMergeTreeOperationRunnerConfig {
    minLength: IConfigRange;
    clients: IConfigRange;
}

const allOpertaions: TestOperation[] = [
    removeRange,
    annotateRange,
    insertAtRefPos,
];

export const debugOptions: IConflictFarmConfig = {
    minLength: { min: 2, max: 2 },
    clients: { min: 3, max: 3 },
    opsPerRoundRange: { min: 1, max: 100 },
    rounds: 1000,
    operations: allOpertaions,
    incrementalLog: true,
    growthFunc: (input: number) => input + 1,
};

export const defaultOptions: IConflictFarmConfig = {
    minLength: { min: 1, max: 512 },
    clients: { min: 1, max: 8 },
    opsPerRoundRange: { min: 1, max: 128 },
    rounds: 8,
    operations: allOpertaions,
    growthFunc: (input: number) => input * 2,
};

export const longOptions: IConflictFarmConfig = {
    minLength: { min: 1, max: 512 },
    clients: { min: 1, max: 32 },
    opsPerRoundRange: { min: 1, max: 512 },
    rounds: 32,
    operations: allOpertaions,
    growthFunc: (input: number) => input * 2,
};

describe("MergeTree.Client", () => {
    // tslint:disable: mocha-no-side-effect-code
    const opts =
        defaultOptions;
    // debugOptions;
    // longOptions;

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

    // eslint-disable-next-line @typescript-eslint/unbound-method
    doOverRange(opts.minLength, opts.growthFunc, (minLength) => {
        // tslint:enable: mocha-no-side-effect-code
        it(`ConflictFarm_${minLength}`, async () => {
            const mt = random.engines.mt19937();
            mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, minLength]);

            const clients: TestClient[] = [new TestClient({ blockUpdateMarkers: true })];
            clients.forEach(
                (c, i) => c.startOrUpdateCollaboration(clientNames[i]));

            let seq = 0;
            while (clients.length < opts.clients.max) {
                clients.forEach((c) => c.updateMinSeq(seq));

                // Add double the number of clients each iteration
                const targetClients = Math.max(opts.clients.min, opts.growthFunc(clients.length));
                for (let cc = clients.length; cc < targetClients; cc++) {
                    const newClient = await TestClient.createFromClientSnapshot(clients[0], clientNames[cc]);
                    clients.push(newClient);
                }

                seq = runMergeTreeOperationRunner(
                    mt,
                    seq,
                    clients,
                    minLength,
                    opts);
            }
        })
            // tslint:disable-next-line: mocha-no-side-effect-code
            .timeout(30 * 1000);
    });
});
