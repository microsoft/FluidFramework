/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils";
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IDeltaManager } from "@fluidframework/container-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ISummaryAckMessage, ISummaryNackMessage, ISummaryOpMessage, SummaryCollection } from "../summaryCollection";

const summaryOp: ISummaryOpMessage = {
    clientId: "cliendId",
    clientSequenceNumber: 5,
    minimumSequenceNumber: 5,
    referenceSequenceNumber: 5,
    sequenceNumber: 6,
    term: 0,
    timestamp: 6,
    type: MessageType.Summarize,
    contents: {
        handle: "OpHandle",
        head: "head",
        message: "message",
        parents: ["parents"],
    },
};

const summaryAck: ISummaryAckMessage = {
    clientId: "cliendId",
    clientSequenceNumber: summaryOp.clientSequenceNumber + 1,
    minimumSequenceNumber: summaryOp.sequenceNumber,
    referenceSequenceNumber: summaryOp.sequenceNumber,
    sequenceNumber: summaryOp.sequenceNumber + 1,
    term: 0,
    timestamp: summaryOp.timestamp + 1,
    type: MessageType.SummaryAck,
    contents: {
        handle: "AckHandle",
        summaryProposal: { summarySequenceNumber: summaryOp.sequenceNumber },
    },
};

const summaryNack: ISummaryNackMessage = {
    clientId: "cliendId",
    clientSequenceNumber: summaryOp.clientSequenceNumber + 1,
    minimumSequenceNumber: summaryOp.sequenceNumber,
    referenceSequenceNumber: summaryOp.sequenceNumber,
    sequenceNumber: summaryOp.sequenceNumber + 1,
    term: 0,
    timestamp: summaryOp.timestamp + 1,
    type: MessageType.SummaryNack,
    contents: {
        message: "Nack",
        summaryProposal: { summarySequenceNumber: summaryOp.sequenceNumber },
    },
};

describe("Summary Collection", () => {
    describe("latestAck", () => {
        it("Ack with op", () => {
            const dm = new MockDeltaManager();
            const sc = new SummaryCollection(dm, new MockLogger());
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
            dm.emit("op", summaryOp);
            dm.emit("op", summaryAck);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const latestAck = sc.latestAck!;
            assert(latestAck !== undefined, "last ack undefined");
            deepMatchesExpected(
                {
                    summaryOp,
                    summaryAck,
                },
                sc.latestAck);
        });

        it("Ack without op", () => {
            const dm = new MockDeltaManager();
            const sc = new SummaryCollection(dm, new MockLogger());
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
            dm.emit("op", summaryAck);
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
        });

        it("Nack with op", () => {
            const dm = new MockDeltaManager();
            const sc = new SummaryCollection(dm, new MockLogger());
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
            dm.emit("op", summaryAck);
            dm.emit("op", summaryNack);
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
        });
    });
    describe("opsSinceLastAck", () => {
        it("Ack with op", () => {
            const dm = new MockDeltaManager();
            dm.on("op", (op) => { dm.lastSequenceNumber = op.sequenceNumber; });

            const sc = new SummaryCollection(dm, new MockLogger());
            assert.strictEqual(sc.opsSinceLastAck, 0);
            dm.emit("op", summaryOp);
            assert.strictEqual(sc.opsSinceLastAck, summaryOp.sequenceNumber);
            dm.emit("op", summaryAck);
            assert.strictEqual(sc.opsSinceLastAck, 0);
        });
        it("Nack with op", () => {
            const dm = new MockDeltaManager();
            dm.on("op", (op) => { dm.lastSequenceNumber = op.sequenceNumber; });

            const sc = new SummaryCollection(dm, new MockLogger());
            assert.strictEqual(sc.opsSinceLastAck, 0);
            dm.emit("op", summaryOp);
            assert.strictEqual(sc.opsSinceLastAck, summaryOp.sequenceNumber);
            dm.emit("op", summaryNack);
            assert.strictEqual(sc.opsSinceLastAck, summaryNack.sequenceNumber);
        });
        it("Ack after Nack with op", () => {
            const dm = new MockDeltaManager();
            dm.on("op", (op) => { dm.lastSequenceNumber = op.sequenceNumber; });

            const sc = new SummaryCollection(dm, new MockLogger());
            assert.strictEqual(sc.opsSinceLastAck, 0);
            dm.emit("op", summaryOp);
            dm.emit("op", summaryNack);
            dm.emit("op", summaryAck);
            assert.strictEqual(sc.opsSinceLastAck, summaryAck.sequenceNumber);
        });
    });

    describe("opActions", () => {
        interface ISummaryCollectionWithCounters {
            summaryCollection: SummaryCollection;
            callCounts: {
                default: number;
                summarize: number;
                summaryAck: number;
                summaryNack: number;
            };
        }
        function createSummaryCollection(
            deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        ): ISummaryCollectionWithCounters {
            const summaryCollection = new SummaryCollection(deltaManager, new MockLogger());
            const callCounts: ISummaryCollectionWithCounters["callCounts"] = {
                default: 0,
                summarize: 0,
                summaryAck: 0,
                summaryNack: 0,
            };
            summaryCollection.on("default", () => callCounts.default++);
            summaryCollection.on(MessageType.Summarize, () => callCounts.summarize++);
            summaryCollection.on(MessageType.SummaryAck, () => callCounts.summaryAck++);
            summaryCollection.on(MessageType.SummaryNack, () => callCounts.summaryNack++);
            return { summaryCollection, callCounts };
        }
        it("Summary op", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", summaryOp);
            assert.strictEqual(callCounts.summarize, 1);
        });

        it("Summary Ack without op", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", summaryAck);
            assert.strictEqual(callCounts.summaryAck, 0);
        });

        it("Summary Ack with op", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", summaryOp);
            dm.emit("op", summaryAck);
            assert.strictEqual(callCounts.summarize, 1);
            assert.strictEqual(callCounts.summaryAck, 1);
        });

        it("Double Summary Ack with op", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", summaryOp);
            dm.emit("op", summaryAck);
            dm.emit("op", summaryAck);
            assert.strictEqual(callCounts.summarize, 1);
            assert.strictEqual(callCounts.summaryAck, 1);
        });

        it("Summary Nack without op", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", summaryNack);
            assert.strictEqual(callCounts.summaryNack, 0);
        });

        it("Summary Nack with op", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", summaryOp);
            dm.emit("op", summaryNack);
            assert.strictEqual(callCounts.summarize, 1);
            assert.strictEqual(callCounts.summaryNack, 1);
        });

        it("Double Summary Nack with op", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", summaryOp);
            dm.emit("op", summaryNack);
            dm.emit("op", summaryNack);
            assert.strictEqual(callCounts.summarize, 1);
            assert.strictEqual(callCounts.summaryNack, 1);
        });

        it("default", () => {
            const dm = new MockDeltaManager();
            const { callCounts } = createSummaryCollection(dm);
            dm.emit("op", {});
            assert.strictEqual(callCounts.default, 1);
        });
    });
});

function deepMatchesExpected<T>(expected: T, actual: T, throwError = true): boolean {
    if (typeof expected !== "object") {
        if (expected === actual) {
            return true;
        } else {
            if (throwError) {
                throw new Error(`Do not Match\n+ ${JSON.stringify(expected)}\n- ${JSON.stringify(actual)}`);
            }
            return false;
        }
    }
    for (const key of Object.keys(expected)) {
        if (!deepMatchesExpected(expected?.[key], actual?.[key], false)) {
            if (throwError) {
                throw new Error(
                    `Do not Match: ${key}\n+ ${JSON.stringify(expected?.[key])}\n- ${JSON.stringify(actual?.[key])}`);
            }
            return false;
        }
    }
    return true;
}
