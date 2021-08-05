/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedClient } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/test-runtime-utils";
import {
    IOrderedClientCollection,
    IOrderedClientElection,
    ISerializedElection,
    ITrackedClient,
    OrderedClientCollection,
    OrderedClientElection,
} from "../orderedClientElection";
import { TestQuorum } from "./testQuorum";

describe("Ordered Client Collection", () => {
    let orderedClients: IOrderedClientCollection;
    const mockLogger = new MockLogger();
    const testQuorum = new TestQuorum();

    let currentSequenceNumber: number = 0;
    const testDeltaManager = { get lastSequenceNumber() { return currentSequenceNumber; } };

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
    function createOrderedClientCollection(
        initialClients: [id: string, seq: number, int: boolean][] = [],
    ): IOrderedClientCollection {
        for (const [id, seq, int] of initialClients) {
            addClient(id, seq, int);
        }
        orderedClients = new OrderedClientCollection(mockLogger, testDeltaManager, testQuorum);
        return orderedClients;
    }
    function assertCollectionState(expectedCount: number, message = "") {
        const prefix = message ? `${message} - ` : "";
        assert.strictEqual(orderedClients.count, expectedCount,
            `${prefix}Invalid client count: ${orderedClients.count} !== ${expectedCount}`);
    }
    function assertOrderedClientIds(...expectedIds: string[]) {
        const actualIds = orderedClients.getAllClients();
        assert.strictEqual(actualIds.length, expectedIds.length,
            `Unexpected count of ordered client ids: ${actualIds.length} !== ${expectedIds.length}`);
        for (let i = 0; i < actualIds.length; i++) {
            assert.strictEqual(actualIds[i].clientId, expectedIds[i],
                `Unexpected ordered client id at index ${i}: ${actualIds[i].clientId} !== ${expectedIds[i]}`);
        }
    }

    afterEach(() => {
        mockLogger.events = [];
        testQuorum.reset();
        currentSequenceNumber = 0;
    });

    describe("Initialize", () => {
        it("Should initialize with empty quorum", () => {
            createOrderedClientCollection();
            assertCollectionState(0);
            assertOrderedClientIds();
        });

        it("Should initialize with correct count", () => {
            createOrderedClientCollection([
                ["a", 1, true],
                ["b", 2, true],
                ["s", 5, false],
                ["c", 9, true],
            ]);
            assertCollectionState(4);
            assertOrderedClientIds("a", "b", "s", "c");
        });

        it("Should initialize in correct order", () => {
            createOrderedClientCollection([
                ["c", 9, true],
                ["b", 2, true],
                ["a", 1, true],
                ["s", 5, false],
            ]);
            assertCollectionState(4);
            assertOrderedClientIds("a", "b", "s", "c");
        });
    });

    describe("Ordered Client Election", () => {
        let election: IOrderedClientElection;
        let electionEventCount = 0;
        function createOrderedClientElection(
            initialClients: [id: string, seq: number, int: boolean][] = [],
            initialState?: ISerializedElection,
        ): IOrderedClientElection {
            createOrderedClientCollection(initialClients);
            if (initialState !== undefined && initialState.electionSequenceNumber > currentSequenceNumber) {
                currentSequenceNumber = initialState.electionSequenceNumber;
            }
            election = new OrderedClientElection(
                mockLogger,
                orderedClients,
                initialState ?? currentSequenceNumber,
                (c: ITrackedClient) => c.client.details.capabilities.interactive,
            );
            election.on("election", () => electionEventCount++);
            return election;
        }
        function incrementElectedClient(sequenceNumber = currentSequenceNumber) {
            if (sequenceNumber > currentSequenceNumber) {
                currentSequenceNumber = sequenceNumber;
            }
            election.incrementElectedClient(sequenceNumber);
        }
        function resetElectedClient(sequenceNumber = currentSequenceNumber) {
            if (sequenceNumber > currentSequenceNumber) {
                currentSequenceNumber = sequenceNumber;
            }
            election.resetElectedClient(sequenceNumber);
        }
        function assertElectionState(
            expectedTotalCount: number,
            expectedEligibleCount: number,
            expectedElectedClientId: string | undefined,
            expectedElectionSequenceNumber: number,
            message = "",
        ) {
            assertCollectionState(expectedTotalCount, message);
            const prefix = message ? `${message} - ` : "";
            assert.strictEqual(election.eligibleCount, expectedEligibleCount,
                `${prefix}Invalid eligible count: ${election.eligibleCount} !== ${expectedEligibleCount}`);
            assert.strictEqual(
                election.electedClient?.clientId, expectedElectedClientId,
                // eslint-disable-next-line max-len
                `${prefix}Invalid elected client id: ${election.electedClient?.clientId} !== ${expectedElectedClientId}`);
            assert.strictEqual(
                election.electionSequenceNumber, expectedElectionSequenceNumber,
                // eslint-disable-next-line max-len
                `${prefix}Invalid election seq #: ${election.electionSequenceNumber} !== ${expectedElectionSequenceNumber}`);
        }
        function assertEvents(expectedElectionCount: number) {
            assert.strictEqual(electionEventCount, expectedElectionCount,
                `Unexpected election event count: ${electionEventCount} !== ${expectedElectionCount}`);
        }
        function assertOrderedEligibleClientIds(...expectedIds: string[]) {
            const actualIds = election.getAllEligibleClients();
            assert.strictEqual(actualIds.length, expectedIds.length,
                `Unexpected count of ordered eligible client ids: ${actualIds.length} !== ${expectedIds.length}`);
            for (let i = 0; i < actualIds.length; i++) {
                assert.strictEqual(actualIds[i].clientId, expectedIds[i],
                    // eslint-disable-next-line max-len
                    `Unexpected ordered eligible client id at index ${i}: ${actualIds[i].clientId} !== ${expectedIds[i]}`);
            }
        }

        afterEach(() => {
            electionEventCount = 0;
        });

        describe("Initialize", () => {
            it("Should initialize with empty quorum", () => {
                createOrderedClientElection();
                assertElectionState(0, 0, undefined, 0);
                assertOrderedEligibleClientIds();
            });

            it("Should initialize with correct client counts and elected client", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                assertElectionState(4, 3, "a", 9);
                assertOrderedEligibleClientIds("a", "b", "c");
            });

            it("Should initialize with empty quorum at specific sequence number", () => {
                currentSequenceNumber = 99;
                createOrderedClientElection();
                assertElectionState(0, 0, undefined, 99);
                assertOrderedEligibleClientIds();
            });

            it("Should initialize with empty quorum and initial state", () => {
                createOrderedClientElection(undefined, { electedClientId: undefined, electionSequenceNumber: 101 });
                assertElectionState(0, 0, undefined, 101);
                assertOrderedEligibleClientIds();
            });

            it("Should log error with empty quorum and initially elected client", () => {
                const clientId = "x";
                createOrderedClientElection(undefined, { electedClientId: clientId, electionSequenceNumber: 101 });
                assertElectionState(0, 0, undefined, 101);
                mockLogger.matchEvents([{ eventName: "InitialElectedClientNotFound", clientId }]);
                assertOrderedEligibleClientIds();
            });

            it("Should initialize with correct client counts and elected client from initial state", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ], { electedClientId: "b", electionSequenceNumber: 4321 });
                assertElectionState(4, 3, "b", 4321);
                assertOrderedEligibleClientIds("a", "b", "c");
            });

            it("Should log error and elect next eligible when initially elected client is ineligible", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["s2", 7, false],
                    ["c", 9, true],
                ], { electedClientId: "s", electionSequenceNumber: 4321 });
                assertElectionState(5, 3, "c", 4321);
                mockLogger.matchEvents([{
                    eventName: "InitialElectedClientIneligible",
                    clientId: "s",
                    electedClientId: "c",
                }]);
                assertOrderedEligibleClientIds("a", "b", "c");
            });

            it("Should log error and elect undefined when initially elected client is ineligible and last", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["s2", 7, false],
                ], { electedClientId: "s", electionSequenceNumber: 4321 });
                assertElectionState(4, 2, undefined, 4321);
                mockLogger.matchEvents([{
                    eventName: "InitialElectedClientIneligible",
                    clientId: "s",
                    electedClientId: undefined,
                }]);
                assertOrderedEligibleClientIds("a", "b");
            });

            it("Should log error when initially elected client is not found", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ], { electedClientId: "x", electionSequenceNumber: 4321 });
                assertElectionState(4, 3, undefined, 4321);
                mockLogger.matchEvents([{ eventName: "InitialElectedClientNotFound", clientId: "x" }]);
                assertOrderedEligibleClientIds("a", "b", "c");
            });
        });

        describe("Add Client", () => {
            it("Should add ineligible client without impacting eligible clients", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                addClient("n", 100, false);
                assertElectionState(5, 3, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("a", "b", "c");
            });

            it("Should add ineligible client to empty quorum without impacting eligible clients", () => {
                createOrderedClientElection();
                addClient("n", 100, false);
                assertElectionState(1, 0, undefined, 0);
                assertEvents(0);
                assertOrderedEligibleClientIds();
            });

            it("Should add and elect eligible client to empty quorum", () => {
                createOrderedClientElection();
                addClient("n", 100);
                assertElectionState(1, 1, "n", 100);
                assertEvents(1);
                assertOrderedEligibleClientIds("n");
            });

            it("Should add eligible client to end", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                addClient("n", 100);
                assertElectionState(5, 4, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("a", "b", "c", "n");
            });

            it("Should add eligible client to middle", () => {
                // Questionable test, since this shouldn't really happen.
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                addClient("n", 3);
                assertElectionState(5, 4, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("a", "b", "n", "c");
            });

            it("Should add eligible client to front", () => {
                // Questionable test, since this shouldn't really happen.
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                addClient("n", 0);
                assertElectionState(5, 4, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("n", "a", "b", "c");
            });
        });

        describe("Remove Client", () => {
            it("Should log error when removing a client from empty quorum", () => {
                createOrderedClientElection();
                const clientId = "x";
                removeClient(clientId);
                mockLogger.matchEvents([{ eventName: "ClientNotFound", clientId }]);
                assertElectionState(0, 0, undefined, 0);
                assertEvents(0);
                assertOrderedEligibleClientIds();
            });

            it("Should log error when removing a client that doesn't exist", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                const clientId = "x";
                removeClient(clientId);
                mockLogger.matchEvents([{ eventName: "ClientNotFound", clientId }]);
                assertElectionState(4, 3, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("a", "b", "c");
            });

            it("Should remove ineligible client", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                removeClient("s", 5);
                assertElectionState(3, 3, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("a", "b", "c");
            });

            it("Should remove other eligible client from end", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                removeClient("c", 5);
                assertElectionState(3, 2, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("a", "b");
            });

            it("Should remove elected eligible client from end", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12); // elect b
                incrementElectedClient(19); // elect c
                assertElectionState(4, 3, "c", 19);
                assertEvents(2);
                removeClient("c", 5);
                assertElectionState(3, 2, undefined, 24);
                assertEvents(3);
                assertOrderedEligibleClientIds("a", "b");
            });

            it("Should remove other eligible client from middle", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                removeClient("b", 5);
                assertElectionState(3, 2, "a", 9);
                assertEvents(0);
                assertOrderedEligibleClientIds("a", "c");
            });

            it("Should remove elected eligible client from middle", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12); // elect b
                assertElectionState(4, 3, "b", 12);
                assertEvents(1);
                removeClient("b", 5);
                assertElectionState(3, 2, "c", 17);
                assertEvents(2);
                assertOrderedEligibleClientIds("a", "c");
            });

            it("Should remove elected eligible client from front", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                removeClient("a", 5);
                assertElectionState(3, 2, "b", 14);
                assertEvents(1);
                assertOrderedEligibleClientIds("b", "c");
            });

            it("Should remove other eligible client from front", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12); // elect b
                assertElectionState(4, 3, "b", 12);
                assertEvents(1);
                removeClient("a", 5);
                assertElectionState(3, 2, "b", 12);
                assertEvents(1);
                assertOrderedEligibleClientIds("b", "c");
            });

            it("Should elect next client when ineligible client is elected, then elected client is removed", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ], { electedClientId: "s", electionSequenceNumber: 4321 });
                removeClient("s", 1111);
                assertElectionState(3, 3, "c", 4321);
                removeClient("c", 1111);
                assertElectionState(2, 2, undefined, 6543);
                assertEvents(1);
            });
        });

        describe("Increment elected client", () => {
            it("Should do nothing in empty quorum", () => {
                createOrderedClientElection();
                incrementElectedClient();
                assertElectionState(0, 0, undefined, 0);
                assertEvents(0);
            });

            it("Should go to next client from first", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12);
                assertElectionState(4, 3, "b", 12);
                assertEvents(1);
            });

            it("Should go to next client from middle", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12);
                incrementElectedClient(16);
                assertElectionState(4, 3, "c", 16);
                assertEvents(2);
            });

            it("Should go to undefined from last", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12);
                incrementElectedClient(16);
                incrementElectedClient(21);
                assertElectionState(4, 3, undefined, 21);
                assertEvents(3);
            });

            it("Should stay unchanged from end", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12);
                incrementElectedClient(16);
                incrementElectedClient(21);
                incrementElectedClient(27); // no-op, still updates election seq #
                assertElectionState(4, 3, undefined, 27);
                assertEvents(3);
            });

            it("Should increment to new nodes", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12);
                incrementElectedClient(16);
                incrementElectedClient(21);
                incrementElectedClient(27); // no-op
                addClient("d", 100);
                addClient("e", 101);
                assertElectionState(6, 5, "d", 100);
                incrementElectedClient(111);
                assertElectionState(6, 5, "e", 111);
                addClient("f", 200);
                incrementElectedClient(205);
                assertElectionState(7, 6, "f", 205);
                incrementElectedClient(221);
                assertElectionState(7, 6, undefined, 221);
                addClient("g", 229);
                assertElectionState(8, 7, "g", 229);
            });

            it("Should increment when ineligible client is elected", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["s", 2, false],
                    ["b", 5, true],
                    ["c", 9, true],
                ], { electedClientId: "s", electionSequenceNumber: 4321 });
                assertElectionState(4, 3, "b", 4321);
                incrementElectedClient(7777);
                assertElectionState(4, 3, "c", 7777);
                assertEvents(1);
            });
        });

        describe("Reset elected client", () => {
            it("Should only change election sequence number in empty quorum", () => {
                createOrderedClientElection();
                resetElectedClient(11);
                assertElectionState(0, 0, undefined, 11);
                assertEvents(0);
            });

            it("Should not reelect, only change election sequence number when already first", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                resetElectedClient(11);
                assertElectionState(4, 3, "a", 11);
                assertEvents(0);
            });

            it("Should reset to first when not first", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12);
                incrementElectedClient(15);
                resetElectedClient(19);
                assertElectionState(4, 3, "a", 19);
                assertEvents(3);
            });

            it("Should reset to first when undefined at end", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["b", 2, true],
                    ["s", 5, false],
                    ["c", 9, true],
                ]);
                incrementElectedClient(12);
                incrementElectedClient(15);
                incrementElectedClient(19);
                resetElectedClient(31);
                assertElectionState(4, 3, "a", 31);
                assertEvents(4);
            });

            it("Should reset to first when ineligible client is elected", () => {
                createOrderedClientElection([
                    ["a", 1, true],
                    ["s", 2, false],
                    ["b", 5, true],
                    ["c", 9, true],
                ], { electedClientId: "s", electionSequenceNumber: 4321 });
                assertElectionState(4, 3, "b", 4321);
                resetElectedClient(7777);
                assertElectionState(4, 3, "a", 7777);
                assertEvents(1);
            });
        });
    });
});
