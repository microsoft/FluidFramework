/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/test-runtime-utils";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ISequencedClient, MessageType } from "@fluidframework/protocol-definitions";
import { OrderedClientElection } from "../orderedClientElection";
import { ISummaryCollectionOpEvents } from "../summaryCollection";
import { SummarizerClientElection } from "../summarizerClientElection";
import { TestQuorum } from "./testQuorum";

describe("Summarizer Client Election", () => {
    const maxOps = 1000;
    const testQuorum = new TestQuorum();
    let currentSequenceNumber: number = 0;
    const mockLogger = new MockLogger();
    let refreshSummarizerCallCount = 0;
    const summaryCollectionEmitter = new TypedEventEmitter<ISummaryCollectionOpEvents>();
    let election: SummarizerClientElection;

    function addClient(clientId: string, sequenceNumber: number, interactive = true) {
        if (sequenceNumber > currentSequenceNumber) {
            currentSequenceNumber = sequenceNumber;
        }
        const details: ISequencedClient["client"]["details"] = { capabilities: { interactive } };
        const c: Partial<ISequencedClient["client"]> = { details };
        const client: ISequencedClient = { client: c as ISequencedClient["client"], sequenceNumber };
        testQuorum.addClient(clientId, client);
    }
    function removeClient(clientId: string, opCount = 1) {
        currentSequenceNumber += opCount;
        testQuorum.removeClient(clientId);
    }
    function createElection(
        initialClients: [id: string, seq: number, int: boolean][] = [],
    ) {
        for (const [id, seq, int] of initialClients) {
            addClient(id, seq, int);
        }
        election = new SummarizerClientElection(
            mockLogger,
            summaryCollectionEmitter,
            new OrderedClientElection(testQuorum),
            maxOps,
        );
        election.on("shouldSummarizeStateChanged", () => refreshSummarizerCallCount++);
    }
    function defaultOp(opCount = 1) {
        currentSequenceNumber += opCount;
        summaryCollectionEmitter.emit("default", { sequenceNumber: currentSequenceNumber });
    }
    function summaryAck(opCount = 1) {
        currentSequenceNumber += opCount;
        summaryCollectionEmitter.emit(MessageType.SummaryAck, { sequenceNumber: currentSequenceNumber });
    }

    function assertState(
        expectedId: string | undefined,
        expectedSeq: number,
        message: string,
    ) {
        // Do not use expectedSeq for now.
        assert.strictEqual(election.electedClientId, expectedId, `Invalid clientId; ${message}`);
    }

    afterEach(() => {
        mockLogger.events = [];
        testQuorum.reset();
        summaryCollectionEmitter.removeAllListeners();
        currentSequenceNumber = 0;
    });

    describe("No initial state", () => {
        it("Should reelect during add/remove clients", () => {
            createElection();
            assertState(undefined, 0, "no clients, should initially be undefined");

            // Add non-interactive client, no effect
            addClient("s1", 1, false);
            assertState(undefined, 0, "only non-interactive client in quorum");

            // Add interactive client, should elect
            addClient("a", 2, true);
            assertState("a", 2, "only one interactive client in quorum, should elect");

            // Add more clients, no effect
            addClient("s2", 3, false);
            addClient("b", 4, true);
            assertState("a", 2, "additional younger clients should have no effect");

            // Remove elected client, should reelect
            removeClient("a", 4);
            assertState("b", 8, "elected client leaving should reelect next oldest client");
        });

        it("Should not yet reelect when client not summarizing", () => {
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ]);
            assertState("a", 7, "initially should be oldest interactive client");

            // Should stay the same right up until max ops
            defaultOp(maxOps);
            assertState("a", 7, "should not reelect <= max ops");

            // Should elect next client at this point
            defaultOp();
            assertState("a", maxOps + 8, "should not yet reelect > max ops");

            // Next election should be undefined, which resets to first client
            defaultOp(maxOps);
            assertState("a", maxOps + 8, "should not reelect <= max ops since baseline");
            defaultOp();
            assertState("a", 2 * maxOps + 9, "should reelect back to oldest client");
        });

        it("Should not reelect when summary ack is found", () => {
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ]);
            assertState("a", 7, "initially should elect oldest interactive client");

            // Should stay the same right up until max ops
            defaultOp(maxOps);
            assertState("a", 7, "should not reelect <= max ops");

            // Summary ack should only increment election seq #
            summaryAck();
            assertState("a", maxOps + 8, "should not reelect after summary ack");

            // Summary ack should prevent reelection
            defaultOp(maxOps);
            assertState("a", maxOps + 8, "should not reelect <= max ops since summary ack");

            // Should elect next client at this point
            defaultOp();
            assertState("a", 2 * maxOps + 9, "should not yet reelect > max ops since summary ack");
        });
    });
});
