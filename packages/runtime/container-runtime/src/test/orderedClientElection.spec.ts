/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { IQuorum, ISequencedClient } from "@fluidframework/protocol-definitions";
import { OrderedClientElection, summarizerClientType } from "../orderedClientElection";

describe("Ordered Client Election", () => {
    const quorumMembers = new Map<string, ISequencedClient>();
    const emitter = new EventEmitter();
    const mockQuorum: Pick<IQuorum, "getMembers" | "on"> = {
        getMembers: () => quorumMembers,
        on(event: string, handler: (...args: any[]) => void) {
            emitter.on(event, handler);
            return this as IQuorum;
        },
    };
    let electedChangeEventCount = 0;
    let summarizerChangeEventCount = 0;

    function addClient(clientId: string, sequenceNumber: number, isSummarizer = false) {
        const details: ISequencedClient["client"]["details"] = {
            capabilities: { interactive: !isSummarizer },
            type: isSummarizer ? summarizerClientType : "",
        };
        const c: Partial<ISequencedClient["client"]> = { details };
        const client: ISequencedClient = { client: c as ISequencedClient["client"], sequenceNumber };
        quorumMembers.set(clientId, client);
        emitter.emit("addMember", clientId, client);
    }
    function removeClient(clientId: string) {
        quorumMembers.delete(clientId);
        emitter.emit("removeMember", clientId);
    }
    function createOrderedClients(
        initialClients: [id: string, seq: number, sum: boolean][] = [],
    ): OrderedClientElection {
        for (const [id, seq, sum] of initialClients) {
            addClient(id, seq, sum);
        }
        const orderedClients = new OrderedClientElection(mockQuorum);
        orderedClients.on("electedChange", () => electedChangeEventCount++);
        orderedClients.on("summarizerChange", () => summarizerChangeEventCount++);
        return orderedClients;
    }
    function assertState(
        orderedClients: OrderedClientElection,
        eligibleCount: number,
        summarizerCount: number,
        electedClientId: string | undefined,
        message = "",
    ) {
        const prefix = message ? `${message} - ` : "";
        // Assume no non-interactive, non-summarizer clients for these tests only.
        const totalCount = eligibleCount + summarizerCount;
        assert.strictEqual(
            orderedClients.getEligibleCount(), eligibleCount, `${prefix}Invalid eligible count`);
        assert.strictEqual(
            orderedClients.getSummarizerCount(), summarizerCount, `${prefix}Invalid summarizer count`);
        assert.strictEqual(
            orderedClients.getTotalCount(), totalCount, `${prefix}Invalid total count`);
        assert.strictEqual(
            orderedClients.getElectedClient()?.clientId, electedClientId, `${prefix}Invalid elected client id`);
    }
    function assertEvents(expectedElectedChangeCount: number, expectedSummarizerChangeCount: number) {
        assert.strictEqual(
            electedChangeEventCount, expectedElectedChangeCount, "Unexpected electedChange event count");
        assert.strictEqual(
            summarizerChangeEventCount, expectedSummarizerChangeCount, "Unexpected summarizerChange event count");
    }
    function assertOrderedClientIds(orderedClients: OrderedClientElection, ...expectedIds: string[]) {
        const orderedIds = orderedClients.getOrderedEligibleClientIds();
        assert.strictEqual(orderedIds.length, expectedIds.length, "Unexpected number of ordered client ids");
        for (let i = 0; i < orderedIds.length; i++) {
            assert.strictEqual(orderedIds[i], expectedIds[i], `Unexpected ordered client id at index ${i}`);
        }
    }

    afterEach(() => {
        quorumMembers.clear();
        electedChangeEventCount = 0;
        summarizerChangeEventCount = 0;
        emitter.removeAllListeners();
    });

    describe("Initialize", () => {
        it("Should initialize with empty quorum", () => {
            const oc = createOrderedClients();
            assertState(oc, 0, 0, undefined);
            assertOrderedClientIds(oc);
        });

        it("Should initialize with correct client counts and current client", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            assertState(oc, 3, 1, "a");
            assertOrderedClientIds(oc, "a", "b", "c");
        });
    });

    describe("Add Client", () => {
        it("Should add summarizer client without impacting nonSummarizer clients", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            addClient("n", 100, true);
            assertState(oc, 3, 2, "a");
            assertEvents(0, 1);
            assertOrderedClientIds(oc, "a", "b", "c");
        });

        it("Should add summarizer client to empty quorum without impacting nonSummarizer clients", () => {
            const oc = createOrderedClients();
            addClient("n", 100, true);
            assertState(oc, 0, 1, undefined);
            assertEvents(0, 1);
            assertOrderedClientIds(oc);
        });

        it("Should add nonSummarizer client to empty quorum", () => {
            const oc = createOrderedClients();
            addClient("n", 100);
            assertState(oc, 1, 0, "n");
            assertEvents(1, 0);
            assertOrderedClientIds(oc, "n");
        });

        it("Should add nonSummarizer client to end", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            addClient("n", 100);
            assertState(oc, 4, 1, "a");
            assertEvents(0, 0);
            assertOrderedClientIds(oc, "a", "b", "c", "n");
        });

        it("Should add nonSummarizer client to middle", () => {
            // Questionable test, since this shouldn't really happen.
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            addClient("n", 3);
            assertState(oc, 4, 1, "a");
            assertEvents(0, 0);
            assertOrderedClientIds(oc, "a", "b", "n", "c");
        });

        it("Should add nonSummarizer client to front", () => {
            // Questionable test, since this shouldn't really happen.
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            addClient("n", 0);
            assertState(oc, 4, 1, "a");
            assertEvents(0, 0);
            assertOrderedClientIds(oc, "n", "a", "b", "c");
        });
    });

    describe("Remove Client", () => {
        it("Should do nothing when removing a client from empty quorum", () => {
            const oc = createOrderedClients();
            removeClient("x");
            assertState(oc, 0, 0, undefined);
            assertEvents(0, 0);
            assertOrderedClientIds(oc);
        });

        it("Should do nothing when removing a client that doesn't exist", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            removeClient("x");
            assertState(oc, 3, 1, "a");
            assertEvents(0, 0);
            assertOrderedClientIds(oc, "a", "b", "c");
        });

        it("Should remove summarizer client", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            removeClient("s");
            assertState(oc, 3, 0, "a");
            assertEvents(0, 1);
            assertOrderedClientIds(oc, "a", "b", "c");
        });

        it("Should remove nonSummarizer client from end", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            removeClient("c");
            assertState(oc, 2, 1, "a");
            assertEvents(0, 0);
            assertOrderedClientIds(oc, "a", "b");
        });

        it("Should remove nonSummarizer client from middle", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            removeClient("b");
            assertState(oc, 2, 1, "a");
            assertEvents(0, 0);
            assertOrderedClientIds(oc, "a", "c");
        });

        it("Should remove nonSummarizer client from front", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            removeClient("a");
            assertState(oc, 2, 1, "b");
            assertEvents(1, 0);
            assertOrderedClientIds(oc, "b", "c");
        });
    });

    describe("Increment Current Client", () => {
        it("Should do nothing in empty quorum", () => {
            const oc = createOrderedClients();
            oc.incrementElectedClient();
            assertState(oc, 0, 0, undefined);
            assertEvents(0, 0);
        });

        it("Should go to next client from first", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.incrementElectedClient();
            assertState(oc, 3, 1, "b");
            assertEvents(1, 0);
        });

        it("Should go to next client from middle", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            assertState(oc, 3, 1, "c");
            assertEvents(2, 0);
        });

        it("Should go to undefined from last", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            assertState(oc, 3, 1, undefined);
            assertEvents(3, 0);
        });

        it("Should stay unchanged from end", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            assertState(oc, 3, 1, undefined);
            assertEvents(3, 0);
        });

        it("Should increment to new nodes", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            addClient("d", 100);
            addClient("e", 101);
            assertState(oc, 5, 1, "d");
            oc.incrementElectedClient();
            assertState(oc, 5, 1, "e");
            addClient("f", 200);
            oc.incrementElectedClient();
            assertState(oc, 6, 1, "f");
        });
    });

    describe("Reset Current Client", () => {
        it("Should do nothing in empty quorum", () => {
            const oc = createOrderedClients();
            oc.resetElectedClient();
            assertState(oc, 0, 0, undefined);
            assertEvents(0, 0);
        });

        it("Should do nothing when already first", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.resetElectedClient();
            assertState(oc, 3, 1, "a");
            assertEvents(0, 0);
        });

        it("Should reset to first when not first", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.resetElectedClient();
            assertState(oc, 3, 1, "a");
            assertEvents(3, 0);
        });

        it("Should reset to first when undefined at end", () => {
            const oc = createOrderedClients([
                ["a", 1, false],
                ["b", 2, false],
                ["s", 5, true],
                ["c", 9, false],
            ]);
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.incrementElectedClient();
            oc.resetElectedClient();
            assertState(oc, 3, 1, "a");
            assertEvents(4, 0);
        });
    });
});
