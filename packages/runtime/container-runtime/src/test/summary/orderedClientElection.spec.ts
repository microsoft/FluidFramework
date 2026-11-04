/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedClient } from "@fluidframework/driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	type IOrderedClientElection,
	type ISerializedElection,
	type ITrackedClient,
	OrderedClientElection,
	SummarizerClientElection,
	summarizerClientType,
} from "../../summary/index.js";

import { TestQuorumClients } from "./testQuorumClients.js";

describe("Ordered Client Collection", () => {
	const testQuorum = new TestQuorumClients();
	let currentSequenceNumber: number = 0;
	const testDeltaManager = {
		get lastSequenceNumber() {
			return currentSequenceNumber;
		},
	};
	const mockLogger = new MockLogger();

	let election: IOrderedClientElection;
	let electionEventCount = 0;

	function addClient(
		clientId: string,
		sequenceNumber: number,
		interactive = true,
		type?: string,
	) {
		if (sequenceNumber > currentSequenceNumber) {
			currentSequenceNumber = sequenceNumber;
		}
		const details: ISequencedClient["client"]["details"] = {
			type,
			capabilities: { interactive },
		};
		const c: Partial<ISequencedClient["client"]> = { details };
		const client: ISequencedClient = {
			client: c as ISequencedClient["client"],
			sequenceNumber,
		};
		testQuorum.addClient(clientId, client);
	}
	function removeClient(clientId: string, opCount = 1) {
		currentSequenceNumber += opCount;
		testQuorum.removeClient(clientId);
	}

	function createElection(
		initialClients: [id: string, seq: number, int: boolean][] = [],
		initialState?: ISerializedElection,
		isEligibleFn = (c: ITrackedClient) => c.client.details.capabilities.interactive,
	): IOrderedClientElection {
		for (const [id, seq, int] of initialClients) {
			addClient(id, seq, int);
		}
		if (
			initialState !== undefined &&
			initialState.electionSequenceNumber > currentSequenceNumber
		) {
			currentSequenceNumber = initialState.electionSequenceNumber;
		}
		election = new OrderedClientElection(
			mockLogger.toTelemetryLogger(),
			testDeltaManager,
			testQuorum,
			initialState ?? currentSequenceNumber,
			isEligibleFn,
		);
		election.on("election", () => electionEventCount++);
		return election;
	}
	function resetElectedClient(sequenceNumber = currentSequenceNumber) {
		if (sequenceNumber > currentSequenceNumber) {
			currentSequenceNumber = sequenceNumber;
		}
		election.resetElectedClient(sequenceNumber);
	}
	function assertElectionState(
		expectedEligibleCount: number,
		expectedElectedClientId: string | undefined,
		expectedElectionSequenceNumber: number,
		message: string,
	) {
		const prefix = message ? `${message} - ` : "";
		assert.strictEqual(
			election.eligibleCount,
			expectedEligibleCount,
			`${prefix}Invalid eligible count: ${election.eligibleCount} !== ${expectedEligibleCount}`,
		);
		assert.strictEqual(
			election.electedClient?.clientId,
			expectedElectedClientId,
			`${prefix}Invalid elected client id: ${election.electedClient?.clientId} !== ${expectedElectedClientId}`,
		);
		assert.strictEqual(
			election.electionSequenceNumber,
			expectedElectionSequenceNumber,
			`${prefix}Invalid election seq #: ${election.electionSequenceNumber} !== ${expectedElectionSequenceNumber}`,
		);
	}
	function assertEvents(expectedElectionCount: number) {
		assert.strictEqual(
			electionEventCount,
			expectedElectionCount,
			`Unexpected election event count: ${electionEventCount} !== ${expectedElectionCount}`,
		);
	}
	function assertOrderedEligibleClientIds(...expectedIds: string[]) {
		const actualIds = election.getAllEligibleClients();
		assert.strictEqual(
			actualIds.length,
			expectedIds.length,
			`Unexpected count of ordered eligible client ids: ${actualIds.length} !== ${expectedIds.length}`,
		);
		for (let i = 0; i < actualIds.length; i++) {
			assert.strictEqual(
				actualIds[i].clientId,
				expectedIds[i],
				`Unexpected ordered eligible client id at index ${i}: ${actualIds[i].clientId} !== ${expectedIds[i]}`,
			);
		}
	}

	afterEach(() => {
		mockLogger.clear();
		testQuorum.reset();
		currentSequenceNumber = 0;
		electionEventCount = 0;
	});

	describe("Initialize", () => {
		it("Should initialize with empty quorum", () => {
			createElection();
			assertElectionState(0, undefined, 0, "empty quorum");
			assertOrderedEligibleClientIds();
		});

		it("Should initialize with correct client counts and elected client", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			assertElectionState(3, "a", 9, "initial clients");
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should initialize with empty quorum at specific sequence number", () => {
			currentSequenceNumber = 99;
			createElection();
			assertElectionState(0, undefined, 99, "empty quorum at seq 99");
			assertOrderedEligibleClientIds();
		});

		it("Should elect parents by join sequence regardless of initial insertion order", () => {
			createElection([
				["c", 9, true],
				["b", 2, true],
				["a", 1, true],
			]);
			assertElectionState(3, "a", 9, "unordered initial clients");
			assert.equal(election.electedParent?.clientId, "a");
			assert.equal(election.peekNextElectedClient()?.clientId, "b");

			removeClient("a");
			assertElectionState(2, "b", 10, "next oldest parent elected");
			assert.equal(election.electedParent?.clientId, "b");
			assertEvents(1);

			resetElectedClient(100);
			assertElectionState(2, "b", 10, "reset retains oldest remaining parent");
			assert.equal(election.electedParent?.clientId, "b");
			assertEvents(1);
		});

		it("Should elect the oldest eligible summarizer regardless of initial insertion order", () => {
			addClient("a", 1);
			addClient("newer", 3, false, summarizerClientType);
			addClient("older", 2, false, summarizerClientType);
			createElection([], undefined, SummarizerClientElection.isClientEligible);
			assertElectionState(3, "older", 3, "oldest summarizer elected");
			assert.equal(election.electedParent?.clientId, "a");

			removeClient("newer");
			assertElectionState(2, "older", 3, "removing newer summarizer has no effect");
			assertEvents(0);

			removeClient("older");
			assertElectionState(1, "a", 5, "parent takes over after summarizer leaves");
			assert.equal(election.electedParent?.clientId, "a");
			assertEvents(1);
		});

		it("Should initialize with empty quorum and initial state", () => {
			createElection(undefined, {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 101,
			});
			assertElectionState(0, undefined, 101, "empty quorum with initial state");
			assertOrderedEligibleClientIds();
		});

		it("Should initialize with correct client counts and elected client from initial state", () => {
			createElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["c", 9, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, "b", 4321, "initial state elects b");
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should log error and elect next eligible when initially elected client is ineligible", () => {
			createElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["s2", 7, false],
					["c", 9, true],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, "c", 4321, "elect next eligible after ineligible");
			mockLogger.assertMatch([
				{
					eventName: "InitialElectedClientIneligible",
					electionSequenceNumber: 4321,
					expectedClientId: "s",
					electedClientId: "c",
				},
			]);
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		for (const electedParentId of [undefined, "missing", "ineligible"]) {
			it(`Should use the restored interactive client as parent when the recorded parent is ${electedParentId}`, () => {
				createElection(
					[
						["a", 1, true],
						["ineligible", 2, false],
						["b", 3, true],
					],
					{ electedClientId: "b", electedParentId, electionSequenceNumber: 100 },
				);
				assert.deepEqual(election.serialize(), {
					electedClientId: "b",
					electedParentId: "b",
					electionSequenceNumber: 100,
				});
				removeClient("b");
				assertElectionState(1, "a", 101, "wrap around after recovered client leaves");
				assert.equal(election.electedParent?.clientId, "a");
			});

			it(`Should preserve a restored summarizer when the recorded parent is ${electedParentId}`, () => {
				addClient("ineligible", 1, false);
				addClient("s", 3, false, summarizerClientType);
				createElection(
					[],
					{ electedClientId: "s", electedParentId, electionSequenceNumber: 100 },
					SummarizerClientElection.isClientEligible,
				);
				assert.deepEqual(election.serialize(), {
					electedClientId: "s",
					electedParentId: undefined,
					electionSequenceNumber: 100,
				});
				addClient("b", 101);
				assert.equal(election.electedClient?.clientId, "s");
				assert.equal(election.electedParent?.clientId, "b");
				resetElectedClient(102);
				assert.equal(election.electedClient?.clientId, "s");
				removeClient("s");
				assertElectionState(1, "b", 103, "new parent takes over after summarizer leaves");
				assert.equal(election.electedParent?.clientId, "b");
			});
		}

		for (const hasParent of [false, true]) {
			it(`Should elect an existing summarizer on fresh initialization ${hasParent ? "with" : "without"} an interactive parent`, () => {
				if (hasParent) {
					addClient("a", 1);
				}
				addClient("s", 2, false, summarizerClientType);
				createElection([], undefined, SummarizerClientElection.isClientEligible);
				assertElectionState(hasParent ? 2 : 1, "s", 2, "existing summarizer elected");
				assert.equal(election.electedParent?.clientId, hasParent ? "a" : undefined);
				if (!hasParent) {
					addClient("a", 3);
				}
				addClient("b", 4);
				assert.equal(election.electedClient?.clientId, "s");
				assert.equal(election.electedParent?.clientId, "a");
				removeClient("s");
				assertElectionState(2, "a", 5, "parent takes over after existing summarizer leaves");
				assert.equal(election.electedParent?.clientId, "a");
			});
		}

		it("Should advance past an ineligible elected client rather than reuse its older parent", () => {
			createElection(
				[
					["a", 1, true],
					["ineligible", 2, false],
					["b", 3, true],
				],
				{
					electedClientId: "ineligible",
					electedParentId: "a",
					electionSequenceNumber: 100,
				},
			);
			assert.deepEqual(election.serialize(), {
				electedClientId: "b",
				electedParentId: "b",
				electionSequenceNumber: 100,
			});
			removeClient("b");
			assertElectionState(1, "a", 101, "wrap around after fallback client leaves");
			assert.equal(election.electedParent?.clientId, "a");
		});

		it("Should log error and elect undefined when initially elected client is ineligible and last", () => {
			createElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["s2", 7, false],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			assertElectionState(2, undefined, 4321, "no eligible after ineligible");
			mockLogger.assertMatch([
				{
					eventName: "InitialElectedClientIneligible",
					electionSequenceNumber: 4321,
					expectedClientId: "s",
					electedClientId: undefined,
				},
			]);
			assertOrderedEligibleClientIds("a", "b");
		});

		it("Should log error when initially elected client is not found", () => {
			createElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["c", 9, true],
				],
				{ electedClientId: "x", electedParentId: "x", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, undefined, 4321, "elected client not found");
			mockLogger.assertMatch([
				{
					eventName: "InitialElectedClientNotFound",
					electionSequenceNumber: 4321,
					expectedClientId: "x",
					electedClientId: undefined,
					clientCount: 4,
				},
			]);
			assertOrderedEligibleClientIds("a", "b", "c");
		});
	});

	describe("Add Client", () => {
		it("Should add ineligible client without impacting eligible clients", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			addClient("n", 100, false);
			assertElectionState(3, "a", 9, "ineligible client added");
			assertEvents(0);
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should add ineligible client to empty quorum without impacting eligible clients", () => {
			createElection();
			addClient("n", 100, false);
			assertElectionState(0, undefined, 0, "ineligible client to empty quorum");
			assertEvents(0);
			assertOrderedEligibleClientIds();
		});

		it("Should add and elect eligible client to empty quorum", () => {
			createElection();
			addClient("n", 100);
			assertElectionState(1, "n", 100, "first eligible client elected");
			assertEvents(1);
			assertOrderedEligibleClientIds("n");
		});

		it("Should add eligible client to end", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			addClient("n", 100);
			assertElectionState(4, "a", 9, "eligible client added to end");
			assertEvents(0);
			assertOrderedEligibleClientIds("a", "b", "c", "n");
		});

		it("Should add eligible client to middle", () => {
			// Questionable test, since this shouldn't really happen.
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			addClient("n", 3);
			assertElectionState(4, "a", 9, "eligible client added to middle");
			assertEvents(0);
			assertOrderedEligibleClientIds("a", "b", "n", "c");
		});

		it("Should add eligible client to front", () => {
			// Questionable test, since this shouldn't really happen.
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			addClient("n", 0);
			assertElectionState(4, "a", 9, "eligible client added to front");
			assertEvents(0);
			assertOrderedEligibleClientIds("n", "a", "b", "c");
		});
	});

	describe("Remove Client", () => {
		it("Should remove ineligible client", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("s", 5);
			assertElectionState(3, "a", 9, "ineligible client removed");
			assertEvents(0);
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should remove other eligible client from end", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("c", 5);
			assertElectionState(2, "a", 9, "eligible client removed from end");
			assertEvents(0);
			assertOrderedEligibleClientIds("a", "b");
		});

		it("Should remove other eligible client from middle", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("b", 5);
			assertElectionState(2, "a", 9, "eligible client removed from middle");
			assertEvents(0);
			assertOrderedEligibleClientIds("a", "c");
		});

		it("Should remove elected eligible client from front", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("a", 5);
			assertElectionState(2, "b", 14, "elected client removed");
			assertEvents(1);
			assertOrderedEligibleClientIds("b", "c");
		});

		it("Should elect next client when ineligible client is elected, then elected client is removed", () => {
			createElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["c", 9, true],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			removeClient("s", 1111);
			assertElectionState(3, "c", 4321, "after removing ineligible elected");
			removeClient("c", 1111);
			assertElectionState(2, "a", 6543, "after removing next elected");
			assertEvents(1);
		});
	});

	describe("Reset elected client", () => {
		it("Should reset a younger parent without displacing its active summarizer", () => {
			addClient("a", 1);
			addClient("b", 2);
			addClient("s", 3, false, summarizerClientType);
			createElection(
				[],
				{ electedClientId: "s", electedParentId: "b", electionSequenceNumber: 50 },
				SummarizerClientElection.isClientEligible,
			);
			const summarizer = election.electedClient;
			const events: {
				client: ITrackedClient | undefined;
				sequenceNumber: number;
				prevClient: ITrackedClient | undefined;
			}[] = [];
			election.on("election", (client, sequenceNumber, prevClient) => {
				events.push({ client, sequenceNumber, prevClient });
			});

			resetElectedClient(100);
			assert.deepEqual(election.serialize(), {
				electedClientId: "s",
				electedParentId: "a",
				electionSequenceNumber: 50,
			});
			assertEvents(1);
			assert.deepEqual(events, [
				{ client: summarizer, sequenceNumber: 100, prevClient: summarizer },
			]);

			removeClient("s");
			assert.deepEqual(election.serialize(), {
				electedClientId: "a",
				electedParentId: "a",
				electionSequenceNumber: 101,
			});
			assertEvents(2);
		});

		it("Should not emit elections or change serialized state when repeatedly resetting the elected interactive client", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
			]);
			const initialState = election.serialize();
			assert.equal(initialState.electedClientId, "a");
			assert.equal(initialState.electedParentId, "a");

			for (let i = 0; i < 2; i++) {
				resetElectedClient(100);
				assert.deepEqual(election.serialize(), initialState);
				assertEvents(0);
			}
		});

		it("Should not emit elections or displace the summarizer when repeatedly resetting its unchanged parent", () => {
			addClient("a", 1);
			addClient("s", 2, false, summarizerClientType);
			createElection(
				[],
				{ electedClientId: "s", electedParentId: "a", electionSequenceNumber: 50 },
				SummarizerClientElection.isClientEligible,
			);
			const initialState = election.serialize();
			assert.equal(initialState.electedClientId, "s");
			assert.equal(initialState.electedParentId, "a");

			for (let i = 0; i < 2; i++) {
				resetElectedClient(100);
				assert.deepEqual(election.serialize(), initialState);
				assertEvents(0);
			}
		});

		it("Should reset to first when ineligible client is elected", () => {
			createElection(
				[
					["a", 1, true],
					["s", 2, false],
					["b", 5, true],
					["c", 9, true],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, "b", 4321, "before reset");
			resetElectedClient(7777);
			assertElectionState(3, "a", 7777, "after reset");
			assertEvents(1);
		});
	});
});
