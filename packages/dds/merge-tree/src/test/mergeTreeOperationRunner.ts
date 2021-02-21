/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import random from "random-js";
import { LocalReference } from "../localReference";
import { IMergeTreeOp, MergeTreeDeltaType } from "../ops";
import { TextSegment } from "../textSegment";
import { SegmentGroup } from "../mergeTree";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

export type TestOperation =
    (client: TestClient, opStart: number, opEnd: number, mt: random.Engine) => (IMergeTreeOp | undefined);

export const removeRange: TestOperation =
    (client: TestClient, opStart: number, opEnd: number) => client.removeRangeLocal(opStart, opEnd);

export const annotateRange: TestOperation =
    (client: TestClient, opStart: number, opEnd: number) =>
        client.annotateRangeLocal(opStart, opEnd, { client: client.longClientId }, undefined);

export const insertAtRefPos: TestOperation =
    (client: TestClient, opStart: number, opEnd: number, mt: random.Engine) => {
        const segOff = client.getContainingSegment(opStart);
        if (segOff.segment) {
            return client.insertAtReferencePositionLocal(
                new LocalReference(client, segOff.segment, segOff.offset),
                TextSegment.make(client.longClientId.repeat(random.integer(1, 3)(mt))));
        }
    };

export interface IConfigRange {
    min: number;
    max: number;
}

export function doOverRange(
    range: IConfigRange,
    growthFunc: (input: number) => number,
    doAction: (current: number) => void) {
    for (let current = range.min; current <= range.max; current = growthFunc(current)) {
        doAction(current);
    }
}

export interface IMergeTreeOperationRunnerConfig {
    readonly rounds: number;
    readonly opsPerRoundRange: IConfigRange;
    readonly incrementalLog?: boolean;
    readonly operations: readonly TestOperation[];
    growthFunc(input: number): number;
}

export function runMergeTreeOperationRunner(
    mt: random.Engine,
    startingSeq: number,
    clients: readonly TestClient[],
    minLength: number,
    config: IMergeTreeOperationRunnerConfig,
    apply = applyMessages) {
    let seq = startingSeq;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    doOverRange(config.opsPerRoundRange, config.growthFunc, (opsPerRound) => {
        if (config.incrementalLog) {
            console.log(`MinLength: ${minLength} Clients: ${clients.length} Ops: ${opsPerRound} Seq: ${seq}`);
        }
        for (let round = 0; round < config.rounds; round++) {
            const logger = new TestClientLogger(
                clients,
                `Clients: ${clients.length} Ops: ${opsPerRound} Round: ${round}`);
            logger.log();
            const messageData = generateOperationMessagesForClients(
                mt,
                seq,
                clients,
                logger,
                opsPerRound,
                minLength,
                config.operations,
            );
            seq = apply(seq, messageData, clients, logger);
            // validate that all the clients match at the end of the round
            logger.validate();
        }
    });

    return seq;
}

export function generateOperationMessagesForClients(
    mt: random.Engine,
    startingSeq: number,
    clients: readonly TestClient[],
    logger: TestClientLogger,
    opsPerRound: number,
    minLength: number,
    operations: readonly TestOperation[]) {
    const minimumSequenceNumber = startingSeq;
    let tempSeq = startingSeq * -1;
    const messages: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];
    for (let i = 0; i < opsPerRound; i++) {
        // pick a client greater than 0, client 0 only applies remote ops
        // and is our baseline
        const client = clients[random.integer(1, clients.length - 1)(mt)];
        const len = client.getLength();
        const sg = client.mergeTree.pendingSegments.last();
        let op: IMergeTreeOp | undefined;
        if (len === 0 || len < minLength) {
            const text = client.longClientId.repeat(random.integer(1, 3)(mt));
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
            messages.push(
                [message, client.peekPendingSegmentGroups(op.type === MergeTreeDeltaType.GROUP ? op.ops.length : 1)]);
        }
    }
    return messages;
}

export function generateClientNames(): string[] {
    const clientNames = [];
    function addClientNames(startChar: string, count: number) {
        const startCode = startChar.charCodeAt(0);
        for (let i = 0; i < count; i++) {
            clientNames.push(String.fromCharCode(startCode + i));
        }
    }

    addClientNames("A", 26);
    addClientNames("a", 26);
    addClientNames("0", 17);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return clientNames;
}

export function applyMessages(
    startingSeq: number,
    messageData: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][],
    clients: readonly TestClient[],
    logger: TestClientLogger,
) {
    let seq = startingSeq;
    // log and apply all the ops created in the round
    while (messageData.length > 0) {
        const [message] = messageData.shift();
        message.sequenceNumber = ++seq;
        logger.log(message, (c) => {
            c.applyMsg(message);
        });
    }
    return seq;
}
