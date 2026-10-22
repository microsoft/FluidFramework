/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { ISequencedClient } from "@fluidframework/driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	type ISerializedElection,
	type ISummaryCollectionOpEvents,
	SummarizerClientElection,
	summarizerClientType,
} from "../../summary/index.js";

import { TestQuorumClients } from "./testQuorumClients.js";

describe("Summarizer Client Election Recovery", () => {
	const testQuorum = new TestQuorumClients();
	let currentSequenceNumber: number = 0;
	const testDeltaManager = {
		get lastSequenceNumber() {
			return currentSequenceNumber;
		},
	};
	const mockLogger = new MockLogger();

	let election: SummarizerClientElection;
	const summaryCollection = new TypedEventEmitter<ISummaryCollectionOpEvents>();
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
	): SummarizerClientElection {
		for (const [id, seq, int] of initialClients) {
			addClient(id, seq, int);
		}
		if (
			initialState !== undefined &&
			initialState.electionSequenceNumber > currentSequenceNumber
		) {
			currentSequenceNumber = initialState.electionSequenceNumber;
		}
		election = new SummarizerClientElection(
			mockLogger.toTelemetryLogger(),
			testDeltaManager,
			testQuorum,
			summaryCollection,
			1000,
			initialState ?? currentSequenceNumber,
		);
		election.on("electedSummarizerChanged", () => electionEventCount++);
		return election;
	}
	function resetElectedClient(sequenceNumber = currentSequenceNumber) {
		if (sequenceNumber > currentSequenceNumber) {
			currentSequenceNumber = sequenceNumber;
		}
		election.resetElectedClient(sequenceNumber);
	}
	function assertElectionState(
		expectedElectedClientId: string | undefined,
		expectedElectionSequenceNumber: number,
		message: string,
	) {
		const prefix = message ? `${message} - ` : "";
		assert.strictEqual(
			election.electedClientId,
			expectedElectedClientId,
			`${prefix}Invalid elected client id: ${election.electedClientId} !== ${expectedElectedClientId}`,
		);
		assert.strictEqual(
			election.serialize().electionSequenceNumber,
			expectedElectionSequenceNumber,
			`${prefix}Invalid election seq #: ${election.serialize().electionSequenceNumber} !== ${expectedElectionSequenceNumber}`,
		);
	}
	function assertEvents(expectedElectionCount: number) {
		assert.strictEqual(
			electionEventCount,
			expectedElectionCount,
			`Unexpected election event count: ${electionEventCount} !== ${expectedElectionCount}`,
		);
	}
	afterEach(() => {
		mockLogger.clear();
		summaryCollection.removeAllListeners();
		testQuorum.reset();
		currentSequenceNumber = 0;
		electionEventCount = 0;
	});

	describe("Initialize", () => {
		it("Should initialize with empty quorum", () => {
			createElection();
			assertElectionState(undefined, 0, "empty quorum");
		});

		it("Should initialize with correct client counts and elected client", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			assertElectionState("a", 9, "initial clients");
		});

		it("Should initialize with empty quorum at specific sequence number", () => {
			currentSequenceNumber = 99;
			createElection();
			assertElectionState(undefined, 99, "empty quorum at seq 99");
		});

		it("Should elect parents by join sequence regardless of initial insertion order", () => {
			createElection([
				["c", 9, true],
				["b", 2, true],
				["a", 1, true],
			]);
			assertElectionState("a", 9, "unordered initial clients");
			assert.equal(election.electedParentId, "a");

			removeClient("a");
			assertElectionState("b", 10, "next oldest parent elected");
			assert.equal(election.electedParentId, "b");
			assertEvents(1);

			resetElectedClient(100);
			assertElectionState("b", 10, "reset retains oldest remaining parent");
			assert.equal(election.electedParentId, "b");
			assertEvents(1);
		});

		it("Should elect the oldest eligible summarizer regardless of initial insertion order", () => {
			addClient("a", 1);
			addClient("newer", 3, false, summarizerClientType);
			addClient("older", 2, false, summarizerClientType);
			createElection();
			assertElectionState("older", 3, "oldest summarizer elected");
			assert.equal(election.electedParentId, "a");

			removeClient("newer");
			assertElectionState("older", 3, "removing newer summarizer has no effect");
			assertEvents(0);

			removeClient("older");
			assertElectionState("a", 5, "parent takes over after summarizer leaves");
			assert.equal(election.electedParentId, "a");
			assertEvents(1);
		});

		it("Should initialize with empty quorum and initial state", () => {
			createElection(undefined, {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 101,
			});
			assertElectionState(undefined, 101, "empty quorum with initial state");
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
			assertElectionState("b", 4321, "initial state elects b");
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
			assertElectionState("c", 4321, "elect next eligible after ineligible");
			mockLogger.assertMatch([
				{
					eventName: "SummarizerClientElection:InitialElectedClientIneligible",
					electionSequenceNumber: 4321,
					expectedClientId: "s",
					electedClientId: "c",
				},
			]);
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
				assertElectionState("a", 101, "wrap around after recovered client leaves");
				assert.equal(election.electedParentId, "a");
			});

			it(`Should preserve a restored summarizer when the recorded parent is ${electedParentId}`, () => {
				addClient("ineligible", 1, false);
				addClient("s", 3, false, summarizerClientType);
				createElection([], {
					electedClientId: "s",
					electedParentId,
					electionSequenceNumber: 100,
				});
				assert.deepEqual(election.serialize(), {
					electedClientId: "s",
					electedParentId: undefined,
					electionSequenceNumber: 100,
				});
				addClient("b", 101);
				assert.equal(election.electedClientId, "s");
				assert.equal(election.electedParentId, "b");
				resetElectedClient(102);
				assert.equal(election.electedClientId, "s");
				removeClient("s");
				assertElectionState("b", 103, "new parent takes over after summarizer leaves");
				assert.equal(election.electedParentId, "b");
			});
		}

		for (const hasParent of [false, true]) {
			it(`Should elect an existing summarizer on fresh initialization ${hasParent ? "with" : "without"} an interactive parent`, () => {
				if (hasParent) {
					addClient("a", 1);
				}
				addClient("s", 2, false, summarizerClientType);
				createElection();
				assertElectionState("s", 2, "existing summarizer elected");
				assert.equal(election.electedParentId, hasParent ? "a" : undefined);
				if (!hasParent) {
					addClient("a", 3);
				}
				addClient("b", 4);
				assert.equal(election.electedClientId, "s");
				assert.equal(election.electedParentId, "a");
				removeClient("s");
				assertElectionState("a", 5, "parent takes over after existing summarizer leaves");
				assert.equal(election.electedParentId, "a");
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
			assertElectionState("a", 101, "wrap around after fallback client leaves");
			assert.equal(election.electedParentId, "a");
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
			assertElectionState(undefined, 4321, "no eligible after ineligible");
			mockLogger.assertMatch([
				{
					eventName: "SummarizerClientElection:InitialElectedClientIneligible",
					electionSequenceNumber: 4321,
					expectedClientId: "s",
					electedClientId: undefined,
				},
			]);
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
			assertElectionState(undefined, 4321, "elected client not found");
			mockLogger.assertMatch([
				{
					eventName: "SummarizerClientElection:InitialElectedClientNotFound",
					electionSequenceNumber: 4321,
					expectedClientId: "x",
					electedClientId: undefined,
					clientCount: 4,
				},
			]);
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
			assertElectionState("a", 9, "ineligible client added");
			assertEvents(0);
		});

		it("Should add ineligible client to empty quorum without impacting eligible clients", () => {
			createElection();
			addClient("n", 100, false);
			assertElectionState(undefined, 0, "ineligible client to empty quorum");
			assertEvents(0);
		});

		it("Should add and elect eligible client to empty quorum", () => {
			createElection();
			addClient("n", 100);
			assertElectionState("n", 100, "first eligible client elected");
			assertEvents(1);
		});

		it("Should add eligible client to end", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			addClient("n", 100);
			assertElectionState("a", 9, "eligible client added to end");
			assertEvents(0);
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
			assertElectionState("a", 9, "eligible client added to middle");
			assertEvents(0);
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
			assertElectionState("a", 9, "eligible client added to front");
			assertEvents(0);
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
			assertElectionState("a", 9, "ineligible client removed");
			assertEvents(0);
		});

		it("Should remove other eligible client from end", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("c", 5);
			assertElectionState("a", 9, "eligible client removed from end");
			assertEvents(0);
		});

		it("Should remove other eligible client from middle", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("b", 5);
			assertElectionState("a", 9, "eligible client removed from middle");
			assertEvents(0);
		});

		it("Should remove elected eligible client from front", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
				["s", 5, false],
				["c", 9, true],
			]);
			removeClient("a", 5);
			assertElectionState("b", 14, "elected client removed");
			assertEvents(1);
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
			assertElectionState("c", 4321, "after removing ineligible elected");
			removeClient("c", 1111);
			assertElectionState("a", 6543, "after removing next elected");
			assertEvents(1);
		});
	});

	describe("Reset elected client", () => {
		it("Should reset a younger parent without displacing its active summarizer", () => {
			addClient("a", 1);
			addClient("b", 2);
			addClient("s", 3, false, summarizerClientType);
			createElection([], {
				electedClientId: "s",
				electedParentId: "b",
				electionSequenceNumber: 50,
			});
			const observedStates: ISerializedElection[] = [];
			election.on("electedSummarizerChanged", () => {
				observedStates.push(election.serialize());
			});

			resetElectedClient(100);
			assert.deepEqual(election.serialize(), {
				electedClientId: "s",
				electedParentId: "a",
				electionSequenceNumber: 50,
			});
			assertEvents(1);
			assert.deepEqual(observedStates, [
				{ electedClientId: "s", electedParentId: "a", electionSequenceNumber: 50 },
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
			createElection([], {
				electedClientId: "s",
				electedParentId: "a",
				electionSequenceNumber: 50,
			});
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
			assertElectionState("b", 4321, "before reset");
			resetElectedClient(7777);
			assertElectionState("a", 7777, "after reset");
			assertEvents(1);
		});
	});
});
