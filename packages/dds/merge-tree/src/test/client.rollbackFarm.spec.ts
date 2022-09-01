/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import * as fs from "fs";
import random from "random-js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { SegmentGroup } from "../mergeTreeNodes";
import { IMergeTreeOp, MergeTreeDeltaType } from "../ops";
import {
    annotateRange,
    applyMessages,
    doOverRange,
    IConfigRange,
    IMergeTreeOperationRunnerConfig,
    insertAtRefPos,
    removeRange,
    ReplayGroup,
    replayResultsPath,
    TestOperation,
    generateClientNames,
} from "./mergeTreeOperationRunner";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

interface IRollbackFarmConfig extends IMergeTreeOperationRunnerConfig {
    minLength: IConfigRange;
    rollbackOnlyClients: IConfigRange;
    editOnlyClients: IConfigRange;
    rollbackAndEditClients: IConfigRange;
    opsPerRollbackRange: IConfigRange;
}

interface IClients {
    clients: TestClient[];
    rollbackOnlyCount: number;
    editOnlyCount: number;
    rollbackAndEditCount: number;
}

const allOperations: TestOperation[] = [
    removeRange,
    annotateRange,
    insertAtRefPos,
];

export const debugOptions: IRollbackFarmConfig = {
    minLength: { min: 2, max: 2 },
    rollbackOnlyClients: { min: 0, max: 0 },
    editOnlyClients: { min: 0, max: 0 },
    rollbackAndEditClients: { min: 1, max: 1 },
    opsPerRollbackRange: { min: 1, max: 15 },
    opsPerRoundRange: { min: 1, max: 100 },
    rounds: 5,
    operations: allOperations,
    incrementalLog: true,
    growthFunc: (input: number) => input + 1,
};

export const defaultOptions: IRollbackFarmConfig = {
    minLength: { min: 1, max: 512 },
    rollbackOnlyClients: { min: 1, max: 1 },
    editOnlyClients: { min: 1, max: 1 },
    rollbackAndEditClients: { min: 1, max: 3 },
    opsPerRollbackRange: { min: 1, max: 128 },
    opsPerRoundRange: { min: 1, max: 128 },
    rounds: 8,
    operations: allOperations,
    growthFunc: (input: number) => input * 2,
};

describe("MergeTree.Client", () => {
    const opts =
        defaultOptions;
        // debugOptions;

    // Generate a list of single character client names, support up to 69 clients
    const clientNames = generateClientNames();

    doOverRange(opts.minLength, opts.growthFunc, (minLength) => {
        it(`RollbackFarm_${minLength}`, async () => {
            const mt = random.engines.mt19937();
            mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, minLength]);

            const clients: IClients = {
                clients: [new TestClient()],
                rollbackOnlyCount: opts.rollbackOnlyClients.min,
                editOnlyCount: opts.editOnlyClients.min,
                rollbackAndEditCount: opts.rollbackAndEditClients.min,
            };
            await addClients(
                clients.clients,
                opts.rollbackOnlyClients.min + opts.editOnlyClients.min + opts.rollbackAndEditClients.min,
                clientNames);
            const maxClientCount = 1 + opts.rollbackOnlyClients.max + opts.editOnlyClients.max
                + opts.rollbackAndEditClients.max;

            let seq = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                seq = runMergeTreeOperationRunner(
                    mt,
                    seq,
                    clients,
                    minLength,
                    opts,
                );

                if (clients.clients.length === maxClientCount) {
                    break;
                }

                clients.clients.forEach((c) => c.updateMinSeq(seq));

                // add another client of random type
                const newClientIndex = random.integer(0, maxClientCount - clients.clients.length - 1)(mt);
                if (newClientIndex < opts.rollbackOnlyClients.max - clients.rollbackOnlyCount) {
                    await addClients(clients.clients, 1, clientNames, 1 + clients.rollbackOnlyCount);
                    clients.rollbackOnlyCount++;
                } else if (newClientIndex < opts.rollbackOnlyClients.max - clients.rollbackOnlyCount
                    + opts.editOnlyClients.max - clients.editOnlyCount) {
                    await addClients(clients.clients, 1, clientNames,
                        1 + clients.rollbackOnlyCount + clients.editOnlyCount);
                    clients.editOnlyCount++;
                } else {
                    await addClients(clients.clients, 1, clientNames, clients.clients.length);
                    clients.rollbackAndEditCount++;
                }
            }
        })
        .timeout(30 * 10000);
    });
});

async function addClients(clients: TestClient[], addCount: number, clientNames: string[],
    insertionIndex: number = clients.length) {
    const targetTotal = addCount + clients.length;
    for (let i = clients.length; i < targetTotal; i++) {
        const newClient = await TestClient.createFromClientSnapshot(clients[0], clientNames[i]);
        clients.splice(insertionIndex, 0, newClient);
    }
}

function runMergeTreeOperationRunner(
    mt: random.Engine,
    startingSeq: number,
    clients: IClients,
    minLength: number,
    config: IRollbackFarmConfig) {
    let seq = startingSeq;
    const results: ReplayGroup[] = [];

    doOverRange(config.opsPerRoundRange, config.growthFunc, (opsPerRound) => {
        if (config.incrementalLog) {
            console.log(`MinLength: ${minLength} Clients: ${clients.clients.length} Ops: ${opsPerRound} Seq: ${seq}`);
        }
        for (let round = 0; round < config.rounds; round++) {
            const initialText = clients.clients[0].getText();
            const logger = new TestClientLogger(
                clients.clients,
                `Clients: ${clients.clients.length} Ops: ${opsPerRound} Round: ${round}`);
            const messageData = generateOperationMessagesForClients(
                mt,
                seq,
                clients,
                logger,
                config.opsPerRollbackRange,
                opsPerRound,
                minLength,
                config.operations,
            );
            if (messageData.length > 0) {
                const msgs = messageData.map((md) => md[0]);
                seq = applyMessages(seq, messageData, clients.clients, logger);
                const resultText = logger.validate();
                results.push({
                    initialText,
                    resultText,
                    msgs,
                    seq,
                });
            }
        }
    });

    if (config.resultsFilePostfix !== undefined) {
        const resultsFilePath =
            `${replayResultsPath}/len_${minLength}-clients_${clients.clients.length}-${config.resultsFilePostfix}`;
        fs.writeFileSync(resultsFilePath, JSON.stringify(results, undefined, 4));
    }

    return seq;
}

function generateOperationMessagesForClients(
    mt: random.Engine,
    startingSeq: number,
    clients: IClients,
    logger: TestClientLogger,
    opsPerRollback: IConfigRange,
    opsPerRound: number,
    minLength: number,
    operations: readonly TestOperation[]) {
    const minimumSequenceNumber = startingSeq;
    let tempSeq = startingSeq * -1;
    const messages: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];

    for (let i = 0; i < opsPerRound; i++) {
        // Pick a random client
        const clientIndex = random.integer(1, clients.clients.length - 1)(mt);
        const isRollbackOnly = clientIndex < clients.rollbackOnlyCount + 1;
        const isEditOnly = !isRollbackOnly && clientIndex < clients.editOnlyCount + clients.rollbackOnlyCount + 1;
        const isRollbackAndEdit = !isRollbackOnly && !isEditOnly;
        const client = clients.clients[clientIndex];
        const len = client.getLength();
        const sg = client.mergeTree.pendingSegments?.last();
        let op: IMergeTreeOp | undefined;

        const isRollback = isRollbackOnly || (isRollbackAndEdit && random.bool()(mt));

        // If rollback, pick number of ops, do that number of random ops, then roll them all back.
        if (isRollback) {
            const rollbackOpCount = random.integer(opsPerRollback.min, opsPerRollback.max)(mt);
            const rollbackOps: IMergeTreeOp[] = [];
            for (let j = 0; j < rollbackOpCount; j++) {
                op = makeOp(len, minLength, client, mt, operations);
                if (op) {
                    rollbackOps.push(op);
                }
            }
            while (rollbackOps.length > 0) {
                const rollbackOp = rollbackOps.pop();
                client.rollback?.({ type: rollbackOp!.type }, client.peekPendingSegmentGroups());
            }
        } else { // If not rollback, do a random single op
            op = makeOp(len, minLength, client, mt, operations);
            if (op !== undefined) {
                // Pre-check to avoid logger.toString() in the string template
                if (sg === client.mergeTree.pendingSegments?.last()) {
                    assert.notEqual(
                        sg,
                        client.mergeTree.pendingSegments?.last(),
                        `op created but segment group not enqueued.${logger}`);
                }
                const message = client.makeOpMessage(op, --tempSeq);
                message.minimumSequenceNumber = minimumSequenceNumber;
                messages.push([message,
                    client.peekPendingSegmentGroups(op.type === MergeTreeDeltaType.GROUP ? op.ops.length : 1)!]);
            }
        }
    }
    return messages;
}

function makeOp(len: number, minLength: number, client: TestClient, mt: random.Engine,
    operations: readonly TestOperation[]): IMergeTreeOp | undefined {
    let op: IMergeTreeOp | undefined;
    if (len === 0 || len < minLength) {
        const text = client.longClientId!.repeat(random.integer(1, 3)(mt));
        op = client.insertTextLocal(
            random.integer(0, len)(mt),
            text);
    } else {
        let opIndex = random.integer(0, operations.length - 1)(mt);
        const start = random.integer(0, len - 1)(mt);
        const end = random.integer(start + 1, len)(mt);

        for (let y = 0; y < operations.length && op === undefined; y++) {
            op = operations[opIndex](client, start, end, mt);
            opIndex++;
            opIndex %= operations.length;
        }
    }
    return op;
}
