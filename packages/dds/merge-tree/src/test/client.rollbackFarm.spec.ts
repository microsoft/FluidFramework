/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import random from "random-js";
import {
    annotateRange,
    applyMessages,
    doOverRange,
    generateOperationMessagesForClients,
    insertAtRefPos,
    removeRange,
    runMergeTreeOperationRunner,
    TestOperation,
} from "./mergeTreeOperationRunner";
import { createClientsAtInitialState, TestClientLogger } from "./testClientLogger";

const allOperations: TestOperation[] = [
    removeRange,
    annotateRange,
    insertAtRefPos,
];

const defaultOptions = {
    minLength: { min: 1, max: 32 },
    opsPerRollbackRange: { min: 1, max: 32 },
    opsPerRoundRange: { min: 10, max: 10 },
    rounds: 10,
    initialOps: 10,
    operations: allOperations,
    growthFunc: (input: number) => input * 2,
};

describe("MergeTree.Client", () => {
    doOverRange(defaultOptions.minLength, defaultOptions.growthFunc, (minLength) => {
        doOverRange(defaultOptions.opsPerRollbackRange, defaultOptions.growthFunc, (opsPerRollback) => {
            it(`RollbackFarm_${minLength} OpsPerRollback: ${opsPerRollback}`, async () => {
                const mt = random.engines.mt19937();
                mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, minLength, opsPerRollback]);

                // A: readonly, B: rollback + edit, C: edit
                const clients = createClientsAtInitialState("", "A", "B", "C");
                let seq = 0;

                for (let round = 0; round < defaultOptions.rounds; round++) {
                    clients.all.forEach((c) => c.updateMinSeq(seq));

                    const logger = new TestClientLogger(clients.all, `Round ${round}`);

                    // initialize and ack 10 random actions on either B or C
                    const initialMsgs = generateOperationMessagesForClients(
                        mt,
                        seq,
                        clients.all,
                        logger,
                        defaultOptions.initialOps,
                        minLength,
                        defaultOptions.operations);
                    seq = applyMessages(seq, initialMsgs, clients.all, logger);

                    seq = runMergeTreeOperationRunner(
                        mt,
                        seq,
                        clients.all,
                        minLength,
                        defaultOptions,
                    );

                    logger.validate();

                    // generate messages to rollback on B, then rollback
                    const rollbackMsgs = generateOperationMessagesForClients(
                        mt,
                        seq,
                        [clients.A, clients.B],
                        logger,
                        opsPerRollback,
                        minLength,
                        defaultOptions.operations);
                    while (rollbackMsgs.length > 0) {
                        const rollbackOp = rollbackMsgs.pop();
                        clients.B.rollback?.({ type: rollbackOp![0].contents.type }, rollbackOp![1]);
                    }

                    logger.validate();
                }
            })
            .timeout(30 * 10000);
        });
    });
});
