/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockDeltaManager, MockLogger } from "@fluidframework/test-runtime-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
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
        summaryProposal:{summarySequenceNumber: summaryOp.sequenceNumber},
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
        errorMessage: "Nack",
        summaryProposal:{summarySequenceNumber: summaryOp.sequenceNumber},
    },
};

describe("Summary Collection", () => {
    describe("latestAck",()=>{
        it("Ack with op",()=>{
            const dm = new MockDeltaManager();
            const sc = new SummaryCollection(
                dm,
                new MockLogger(),
                {},
            );
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

        it("Ack without op",()=>{
            const dm = new MockDeltaManager();
            const sc = new SummaryCollection(
                dm,
                new MockLogger(),
                {},
            );
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
            dm.emit("op", summaryAck);
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
        });

        it("Nack with op",()=>{
            const dm = new MockDeltaManager();
            const sc = new SummaryCollection(
                dm,
                new MockLogger(),
                {},
            );
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
            dm.emit("op", summaryAck);
            dm.emit("op", summaryNack);
            assert.strictEqual(sc.latestAck, undefined, "last ack undefined");
        });
    });
    describe("opsSinceLastAck",()=>{
        it("Ack with op",()=>{
            const dm = new MockDeltaManager();
            dm.on("op", (op)=>{dm.lastSequenceNumber = op.sequenceNumber;});

            const sc = new SummaryCollection(
                dm,
                new MockLogger(),
                {},
            );
            assert.strictEqual(sc.opsSinceLastAck, 0);
            dm.emit("op", summaryOp);
            assert.strictEqual(sc.opsSinceLastAck, summaryOp.sequenceNumber);
            dm.emit("op", summaryAck);
            assert.strictEqual(sc.opsSinceLastAck, 0);
        });
        it("Nack with op",()=>{
            const dm = new MockDeltaManager();
            dm.on("op", (op)=>{dm.lastSequenceNumber = op.sequenceNumber;});

            const sc = new SummaryCollection(
                dm,
                new MockLogger(),
                {},
            );
            assert.strictEqual(sc.opsSinceLastAck, 0);
            dm.emit("op", summaryOp);
            assert.strictEqual(sc.opsSinceLastAck, summaryOp.sequenceNumber);
            dm.emit("op", summaryNack);
            assert.strictEqual(sc.opsSinceLastAck, summaryNack.sequenceNumber);
        });
        it("Ack after Nack with op",()=>{
            const dm = new MockDeltaManager();
            dm.on("op", (op)=>{dm.lastSequenceNumber = op.sequenceNumber;});

            const sc = new SummaryCollection(
                dm,
                new MockLogger(),
                {},
            );
            assert.strictEqual(sc.opsSinceLastAck, 0);
            dm.emit("op", summaryOp);
            dm.emit("op", summaryNack);
            dm.emit("op", summaryAck);
            assert.strictEqual(sc.opsSinceLastAck, summaryAck.sequenceNumber);
        });
    });

    describe("opActions",()=>{
        it("Summary op",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    summarize:()=>called++,
                },
            );
            dm.emit("op", summaryOp);
            assert.strictEqual(called, 1);
        });

        it("Summary Ack without op",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    summaryAck:()=>called++,
                },
            );
            dm.emit("op", summaryAck);
            assert.strictEqual(called, 0);
        });

        it("Summary Ack with op",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    summaryAck:()=>called++,
                },
            );
            dm.emit("op", summaryOp);
            dm.emit("op", summaryAck);
            assert.strictEqual(called, 1);
        });

        it("Double Summary Ack with op",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    summaryAck:()=>called++,
                },
            );
            dm.emit("op", summaryOp);
            dm.emit("op", summaryAck);
            dm.emit("op", summaryAck);
            assert.strictEqual(called, 1);
        });

        it("Summary Nack without op",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    summaryNack:()=>called++,
                },
            );
            dm.emit("op", summaryNack);
            assert.strictEqual(called, 0);
        });

        it("Summary Nack with op",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    summaryNack:()=>called++,
                },
            );
            dm.emit("op", summaryOp);
            dm.emit("op", summaryNack);

            assert.strictEqual(called, 1);
        });

        it("Double Summary Nack with op",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    summaryNack:()=>called++,
                },
            );
            dm.emit("op", summaryOp);
            dm.emit("op", summaryNack);
            dm.emit("op", summaryNack);

            assert.strictEqual(called, 1);
        });

        it("default",()=>{
            const dm = new MockDeltaManager();
            let called = 0;
            new SummaryCollection(
                dm,
                new MockLogger(),
                {
                    default:()=>called++,
                },
            );
            dm.emit("op", {});
            assert.strictEqual(called, 1);
        });
    });
});

function deepMatchesExpected<T>(expected: T, actual: T, throwError = true): boolean {
    if(typeof expected !== "object") {
        if(expected === actual) {
            return true;
        }else{
            if(throwError) {
                throw new Error(`Do not Match\n+ ${JSON.stringify(expected)}\n- ${JSON.stringify(actual)}`);
            }
            return false;
        }
    }
    for(const key of Object.keys(expected)) {
        if(!deepMatchesExpected(expected?.[key], actual?.[key], false)) {
            if(throwError) {
                throw new Error(
                    `Do not Match: ${key}\n+ ${JSON.stringify(expected?.[key])}\n- ${JSON.stringify(actual?.[key])}`);
            }
            return false;
        }
    }
    return true;
}
