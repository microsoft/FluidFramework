/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluid-internal/mock-logger";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ISequencedClient, MessageType } from "@fluidframework/protocol-definitions";
import { ISerializedElection, OrderedClientCollection, OrderedClientElection } from "../orderedClientElection";
import { ISummaryCollectionOpEvents } from "../summaryCollection";
import { SummarizerClientElection } from "../summarizerClientElection";
import { TestQuorum } from "./testQuorum";

describe("Summarizer Client Election", () => {
    const maxOps = 1000;
    const testQuorum = new TestQuorum();
    let currentSequenceNumber: number = 0;
    const testDeltaManager = { get lastSequenceNumber() { return currentSequenceNumber; } };
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
        initialState?: ISerializedElection,
        electionEnabled = true,
    ) {
        for (const [id, seq, int] of initialClients) {
            addClient(id, seq, int);
        }
        election = new SummarizerClientElection(
            mockLogger,
            summaryCollectionEmitter,
            new OrderedClientElection(
                mockLogger,
                new OrderedClientCollection(mockLogger, testDeltaManager, testQuorum),
                initialState ?? currentSequenceNumber,
                SummarizerClientElection.isClientEligible,
            ),
            maxOps,
            electionEnabled,
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
        const { electedClientId, electionSequenceNumber } = election.serialize();
        assert.strictEqual(electedClientId, election.electedClientId, `Inconsistent clientId; ${message}`);
        assert.strictEqual(electedClientId, expectedId, `Invalid clientId; ${message}`);
        assert.strictEqual(electionSequenceNumber, expectedSeq, `Invalid seq #; ${message}`);
    }

    afterEach(() => {
        mockLogger.events = [];
        testQuorum.reset();
        summaryCollectionEmitter.removeAllListeners();
        currentSequenceNumber = 0;
    });

    describe("With initial state", () => {
        it("Should automatically elect oldest eligible client on op when undefined initial client", () => {
            currentSequenceNumber = 678;
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ], { electedClientId: undefined, electionSequenceNumber: 432 });
            assertState(undefined, 432, "no elected client at first");
            defaultOp();
            assertState("a", 679, "auto-elect first eligible client");
        });

        it("Should automatically elect oldest eligible client on op when not found initial client", () => {
            currentSequenceNumber = 678;
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ], { electedClientId: "x", electionSequenceNumber: 432 });
            assertState(undefined, 432, "no elected client at first");
            defaultOp();
            assertState("a", 679, "auto-elect first eligible client");
        });

        it("Should already have elected next eligible client when ineligible initial client", () => {
            currentSequenceNumber = 678;
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ], { electedClientId: "s2", electionSequenceNumber: 432 });
            assertState("b", 432, "auto-elect next eligible client");
        });

        it("Should remain unelected with empty quorum", () => {
            currentSequenceNumber = 678;
            createElection([], { electedClientId: undefined, electionSequenceNumber: 432 });
            assertState(undefined, 432, "no elected client at first");
            defaultOp();
            assertState(undefined, 432, "still no client to elect");
        });

        it("Should remain unelected with empty quorum and not found client", () => {
            currentSequenceNumber = 678;
            createElection([], { electedClientId: "x", electionSequenceNumber: 432 });
            assertState(undefined, 432, "no client to elect");
        });

        it("Should reelect during add/remove clients", () => {
            createElection([], { electedClientId: undefined, electionSequenceNumber: 12 });
            assertState(undefined, 12, "no clients, should initially be undefined");

            // Add non-interactive client, no effect
            addClient("s1", 1, false);
            assertState(undefined, 12, "only non-interactive client in quorum");

            // Add interactive client, should elect
            addClient("a", 17, true);
            assertState("a", 17, "only one interactive client in quorum, should elect");

            // Add more clients, no effect
            addClient("s2", 19, false);
            addClient("b", 41, true);
            assertState("a", 17, "additional younger clients should have no effect");

            // Remove elected client, should reelect
            removeClient("a", 400);
            assertState("b", 441, "elected client leaving should reelect next oldest client");
        });

        it("Should reelect when client not summarizing", () => {
            currentSequenceNumber = 4800;
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ], { electedClientId: "b", electionSequenceNumber: 4000 });
            assertState("b", 4000, "elected client based on initial state");

            // Should stay the same right up until max ops
            defaultOp(maxOps - 800);
            assertState("b", 4000, "should not reelect <= max ops");

            // Should elect first client at this point
            defaultOp();
            assertState("a", maxOps + 4001, "should reelect > max ops");

            // Trigger another reelection
            defaultOp(maxOps);
            assertState("a", maxOps + 4001, "should not reelect <= max ops since baseline");
            defaultOp();
            assertState("b", 2 * maxOps + 4002, "should reelect again");
        });

        it("Should not reelect when summary ack is found", () => {
            currentSequenceNumber = 4800;
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ], { electedClientId: "s2", electionSequenceNumber: 4000 });
            assertState("b", 4000, "elected based on initial state");

            // Should stay the same right up until max ops
            defaultOp(maxOps - 800);
            assertState("b", 4000, "should not reelect <= max ops");

            // Summary ack should only increment election seq #
            summaryAck();
            assertState("b", maxOps + 4001, "should not reelect after summary ack");

            // Summary ack should prevent reelection
            defaultOp(maxOps);
            assertState("b", maxOps + 4001, "should not reelect <= max ops since summary ack");

            // Should elect next client at this point
            defaultOp();
            assertState("a", 2 * maxOps + 4002, "should reelect > max ops since summary ack");
        });

        it("Should never reelect when disabled", () => {
            currentSequenceNumber = 4800;
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ], { electedClientId: "b", electionSequenceNumber: 4000 }, false);
            assertState("b", 4000, "elected client based on initial state");

            // Should stay the same right up until max ops
            defaultOp(maxOps - 800);
            assertState("b", 4000, "should not reelect <= max ops");

            // Should elect first client at this point if enabled
            defaultOp();
            assertState("b", 4000, "would reelect > max ops, but not since disabled");

            // Trigger another reelection if it were to be enabled
            defaultOp(maxOps);
            assertState("b", 4000, "should not reelect <= max ops since baseline");
            defaultOp();
            assertState("b", 4000, "would reelect again, but not since disabled");
        });
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

        it("Should reelect when client not summarizing", () => {
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
            assertState("b", maxOps + 8, "should reelect > max ops");

            // Next election should be undefined, which resets to first client
            defaultOp(maxOps);
            assertState("b", maxOps + 8, "should not reelect <= max ops since baseline");
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
            assertState("b", 2 * maxOps + 9, "should reelect > max ops since summary ack");
        });

        it("Should never reelect when disabled", () => {
            createElection([
                ["s1", 1, false],
                ["a", 2, true],
                ["s2", 4, false],
                ["b", 7, true],
            ], undefined, false);
            assertState("a", 7, "initially should be oldest interactive client");

            // Should stay the same right up until max ops
            defaultOp(maxOps);
            assertState("a", 7, "should not reelect <= max ops");

            // Should elect next client at this point
            defaultOp();
            assertState("a", 7, "would reelect > max ops, but not since disabled");

            // Next election should be undefined, which resets to first client
            defaultOp(maxOps);
            assertState("a", 7, "should not reelect <= max ops since baseline");
            defaultOp();
            assertState("a", 7, "would reelect back to oldest client, but not since disabled");
        });
    });
});
