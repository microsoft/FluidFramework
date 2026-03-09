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
} from "../../summary/index.js";

import { TestQuorumClients } from "./testQuorumClients.js";

describe("Ordered Client Election", () => {
	let election: IOrderedClientElection;
	let electionEventCount = 0;
	const mockLogger = new MockLogger();
	const testQuorum = new TestQuorumClients();

	let currentSequenceNumber: number = 0;
	const testDeltaManager = {
		get lastSequenceNumber() {
			return currentSequenceNumber;
		},
	};

	function addClient(clientId: string, sequenceNumber: number, interactive = true) {
		if (sequenceNumber > currentSequenceNumber) {
			currentSequenceNumber = sequenceNumber;
		}
		const details: ISequencedClient["client"]["details"] = { capabilities: { interactive } };
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
	function createOrderedClientElection(
		initialClients: [id: string, seq: number, int: boolean][] = [],
		initialState?: ISerializedElection,
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
			(c: ITrackedClient) => c.client.details.capabilities.interactive,
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
		message = "",
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
			createOrderedClientElection();
			assertElectionState(0, undefined, 0);
			assertOrderedEligibleClientIds();
		});

		it("Should initialize with correct client counts and elected client", () => {
			createOrderedClientElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			assertElectionState(3, "a", 9);
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should initialize with empty quorum at specific sequence number", () => {
			currentSequenceNumber = 99;
			createOrderedClientElection();
			assertElectionState(0, undefined, 99);
			assertOrderedEligibleClientIds();
		});

		it("Should initialize with empty quorum and initial state", () => {
			createOrderedClientElection(undefined, {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 101,
			});
			assertElectionState(0, undefined, 101);
			assertOrderedEligibleClientIds();
		});

		it("Should initialize with correct client counts and elected client from initial state", () => {
			createOrderedClientElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["c", 9, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, "b", 4321);
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should log error and elect next eligible when initially elected client is ineligible", () => {
			createOrderedClientElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["s2", 7, false],
					["c", 9, true],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, "c", 4321);
			mockLogger.matchEvents([
				{
					eventName: "InitialElectedClientIneligible",
					clientId: "s",
					electedClientId: "c",
				},
			]);
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should log error and elect undefined when initially elected client is ineligible and last", () => {
			createOrderedClientElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["s2", 7, false],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			assertElectionState(2, undefined, 4321);
			mockLogger.matchEvents([
				{
					eventName: "InitialElectedClientIneligible",
					clientId: "s",
					electedClientId: undefined,
				},
			]);
			assertOrderedEligibleClientIds("a", "b");
		});

		it("Should log error when initially elected client is not found", () => {
			createOrderedClientElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["c", 9, true],
				],
				{ electedClientId: "x", electedParentId: "x", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, undefined, 4321);
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
			assertElectionState(3, "a", 9);
			assertEvents(0);
			assertOrderedEligibleClientIds("a", "b", "c");
		});

		it("Should add ineligible client to empty quorum without impacting eligible clients", () => {
			createOrderedClientElection();
			addClient("n", 100, false);
			assertElectionState(0, undefined, 0);
			assertEvents(0);
			assertOrderedEligibleClientIds();
		});

		it("Should add and elect eligible client to empty quorum", () => {
			createOrderedClientElection();
			addClient("n", 100);
			assertElectionState(1, "n", 100);
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
			assertElectionState(4, "a", 9);
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
			assertElectionState(4, "a", 9);
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
			assertElectionState(4, "a", 9);
			assertEvents(0);
			assertOrderedEligibleClientIds("n", "a", "b", "c");
		});
	});

	describe("Remove Client", () => {
		it("Should remove ineligible client", () => {
			createOrderedClientElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("s", 5);
			assertElectionState(3, "a", 9);
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
			assertElectionState(2, "a", 9);
			assertEvents(0);
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
			assertElectionState(2, "a", 9);
			assertEvents(0);
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
			assertElectionState(2, "b", 14);
			assertEvents(1);
			assertOrderedEligibleClientIds("b", "c");
		});

		it("Should elect next client when ineligible client is elected, then elected client is removed", () => {
			createOrderedClientElection(
				[
					["a", 1, true],
					["b", 2, true],
					["s", 5, false],
					["c", 9, true],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			removeClient("s", 1111);
			assertElectionState(3, "c", 4321);
			removeClient("c", 1111);
			assertElectionState(2, "a", 6543);
			assertEvents(1);
		});
	});

	describe("Reset elected client", () => {
		it("Should reset to first when ineligible client is elected", () => {
			createOrderedClientElection(
				[
					["a", 1, true],
					["s", 2, false],
					["b", 5, true],
					["c", 9, true],
				],
				{ electedClientId: "s", electedParentId: "s", electionSequenceNumber: 4321 },
			);
			assertElectionState(3, "b", 4321);
			resetElectedClient(7777);
			assertElectionState(3, "a", 7777);
			assertEvents(1);
		});
	});
});
