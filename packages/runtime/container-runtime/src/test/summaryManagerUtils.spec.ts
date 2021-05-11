/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { IQuorum, ISequencedClient } from "@fluidframework/protocol-definitions";
import { OrderedClients, summarizerClientType } from "../summaryManagerUtils";

describe("Summary Manager Utils", () => {
    describe("Ordered Clients", () => {
        const quorumMembers = new Map<string, ISequencedClient>();
        const emitter = new EventEmitter();
        const mockQuorum: Pick<IQuorum, "getMembers" | "on"> = {
            getMembers: () => quorumMembers,
            on(event: string, handler: (...args: any[]) => void) {
                emitter.on(event, handler);
                return this as IQuorum;
            },
        };
        let currentChangeEventCount = 0;
        let summarizerChangeEventCount = 0;

        function addClient(clientId: string, sequenceNumber: number, isSummarizer = false) {
            const client: ISequencedClient = {
                client: {
                    details: {
                        type: isSummarizer ? summarizerClientType : "",
                    },
                } as any,
                sequenceNumber,
            };
            quorumMembers.set(clientId, client);
            emitter.emit("addMember", clientId, client);
        }
        function removeClient(clientId: string) {
            quorumMembers.delete(clientId);
            emitter.emit("removeMember", clientId);
        }
        function createOrderedClients(initialClients: [id: string, seq: number, sum: boolean][] = []): OrderedClients {
            for (const [id, seq, sum] of initialClients) {
                addClient(id, seq, sum);
            }
            const orderedClients = new OrderedClients(mockQuorum);
            orderedClients.on("currentChange", () => currentChangeEventCount++);
            orderedClients.on("summarizerChange", () => summarizerChangeEventCount++);
            return orderedClients;
        }
        function assertState(
            orderedClients: OrderedClients,
            nonSummarizerCount: number,
            summarizerCount: number,
            currentClientId: string | undefined,
            message = "",
        ) {
            const prefix = message ? `${message} - ` : "";
            const totalCount = nonSummarizerCount + summarizerCount;
            assert.strictEqual(
                orderedClients.getNonSummarizerCount(), nonSummarizerCount, `${prefix}Invalid nonSummarizer count`);
            assert.strictEqual(
                orderedClients.getSummarizerCount(), summarizerCount, `${prefix}Invalid summarizer count`);
            assert.strictEqual(
                orderedClients.getTotalCount(), totalCount, `${prefix}Invalid total count`);
            assert.strictEqual(
                orderedClients.getCurrentClient()?.clientId,
                currentClientId,
                `${prefix}Invalid initial current client id`);
        }
        function assertEvents(expectedCurrentChangeCount: number, expectedSummarizerChangeCount: number) {
            assert.strictEqual(
                currentChangeEventCount, expectedCurrentChangeCount, "Unexpected currentChange event count");
            assert.strictEqual(
                summarizerChangeEventCount, expectedSummarizerChangeCount, "Unexpected summarizerChange event count");
        }
        function assertOrderedClientIds(orderedClients: OrderedClients, ...expectedIds: string[]) {
            const orderedIds = orderedClients.getOrderedNonSummarizerClientIds();
            assert.strictEqual(orderedIds.length, expectedIds.length, "Unexpected number of ordered client ids");
            for (let i = 0; i < orderedIds.length; i++) {
                assert.strictEqual(orderedIds[i], expectedIds[i], `Unexpected ordered client id at index ${i}`);
            }
        }

        afterEach(() => {
            quorumMembers.clear();
            currentChangeEventCount = 0;
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
                oc.incrementCurrentClient();
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
                oc.incrementCurrentClient();
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
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
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
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
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
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
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
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                addClient("d", 100);
                addClient("e", 101);
                assertState(oc, 5, 1, "d");
                oc.incrementCurrentClient();
                assertState(oc, 5, 1, "e");
                addClient("f", 200);
                oc.incrementCurrentClient();
                assertState(oc, 6, 1, "f");
            });
        });

        describe("Reset Current Client", () => {
            it("Should do nothing in empty quorum", () => {
                const oc = createOrderedClients();
                oc.resetCurrentClient();
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
                oc.resetCurrentClient();
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
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.resetCurrentClient();
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
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.incrementCurrentClient();
                oc.resetCurrentClient();
                assertState(oc, 3, 1, "a");
                assertEvents(4, 0);
            });
        });
    });
});
