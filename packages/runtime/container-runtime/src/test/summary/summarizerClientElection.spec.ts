/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	ISummarizerEvents,
	SummarizerStopReason,
} from "@fluidframework/container-runtime-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import type { ISequencedClient } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	type IConnectedEvents,
	type IConnectedState,
	type ISerializedElection,
	type ISummarizer,
	type ISummaryCollectionOpEvents,
	SummarizerClientElection,
	SummaryManager,
	summarizerClientType,
} from "../../summary/index.js";

import { TestQuorumClients } from "./testQuorumClients.js";

describe("Summarizer Client Election", () => {
	const maxOps = 1000;
	const testQuorum = new TestQuorumClients();
	let currentSequenceNumber: number = 0;
	const testDeltaManager = {
		get lastSequenceNumber() {
			return currentSequenceNumber;
		},
	};
	const mockLogger = new MockLogger();
	const summaryCollectionEmitter = new TypedEventEmitter<ISummaryCollectionOpEvents>();
	let election: SummarizerClientElection;
	const summaryManagers: SummaryManager[] = [];

	const summaryCollection = {
		opsSinceLastAck: 0,
		addOpListener: () => {},
		removeOpListener: () => {},
	};

	class TestConnectedState
		extends TypedEventEmitter<IConnectedEvents>
		implements IConnectedState
	{
		public connected = false;
		constructor(public readonly clientId: string) {
			super();
		}

		public connect() {
			this.connected = true;
			this.emit("connected", this.clientId);
		}

		public disconnect() {
			this.connected = false;
			this.emit("disconnected");
		}
	}

	class TestSummarizer extends TypedEventEmitter<ISummarizerEvents> implements ISummarizer {
		private notImplemented(): never {
			throw new Error("not implemented");
		}
		public onBehalfOf: string | undefined;
		public state: "notStarted" | "running" | "stopped" = "notStarted";
		public readonly stopDeferred = new Deferred<string | undefined>();
		public readonly runDeferred = new Deferred<void>();
		public clientId: string | undefined;

		public async setSummarizer() {
			this.notImplemented();
		}
		public get cancelled() {
			return this.state !== "running";
		}
		public close() {}
		public stop(reason?: string): void {
			this.stopDeferred.resolve(reason);
		}
		public async run(onBehalfOf: string): Promise<SummarizerStopReason> {
			this.onBehalfOf = onBehalfOf;
			this.state = "running";
			await Promise.all([this.stopDeferred.promise, this.runDeferred.promise]);
			this.state = "stopped";
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			removeClient(this.clientId!, 0);
			return "summarizerClientDisconnected";
		}

		public readonly summarizeOnDemand = () => this.notImplemented();
		public readonly enqueueSummarize = () => this.notImplemented();
		public get IFluidLoadable() {
			return this.notImplemented();
		}
		public get handle() {
			return this.notImplemented();
		}
	}

	const flushPromises = async () => new Promise((resolve) => process.nextTick(resolve));

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

	const throttler = {
		delayMs: 0,
		numAttempts: 0,
		getDelay() {
			return this.delayMs;
		},
		maxDelayMs: 0,
		delayWindowMs: 0,
		delayFn: () => 0,
	};

	function createElection(
		initialClients: [id: string, seq: number, int: boolean][] = [],
		initialState?: ISerializedElection,
	) {
		for (const [id, seq, int] of initialClients) {
			addClient(id, seq, int);
		}
		if (initialState !== undefined) {
			currentSequenceNumber = Math.max(
				currentSequenceNumber,
				initialState.electionSequenceNumber,
			);
		}
		election = new SummarizerClientElection(
			mockLogger.toTelemetryLogger(),
			testDeltaManager,
			testQuorum,
			summaryCollectionEmitter,
			maxOps,
			initialState ?? currentSequenceNumber,
		);
	}

	function createManager(parentId: string) {
		const connectedState = new TestConnectedState(parentId);
		const summarizers: TestSummarizer[] = [];
		const requestSummarizer = async (): Promise<ISummarizer> => {
			const summarizer = new TestSummarizer();
			summarizer.clientId = `${parentId}-summarizer`;
			summarizers.push(summarizer);
			addClient(summarizer.clientId, currentSequenceNumber, false, summarizerClientType);
			return summarizer;
		};
		const summaryManager = new SummaryManager(
			election,
			connectedState,
			summaryCollection,
			mockLogger,
			requestSummarizer,
			throttler,
			{
				initialDelayMs: 0,
				opsToBypassInitialDelay: 0,
			},
		);
		summaryManager.start();
		summaryManagers.push(summaryManager);
		return { connectedState, summarizers };
	}

	function defaultOp(opCount = 1) {
		currentSequenceNumber += opCount;
		summaryCollectionEmitter.emit("default", { sequenceNumber: currentSequenceNumber });
	}
	function summaryAck(opCount = 1) {
		currentSequenceNumber += opCount;
		summaryCollectionEmitter.emit(MessageType.SummaryAck, {
			sequenceNumber: currentSequenceNumber,
		});
	}

	function assertState(
		expectedId: string | undefined,
		expectedParentId: string | undefined,
		expectedSeq: number,
		message: string,
	) {
		const { electedClientId, electedParentId, electionSequenceNumber } = election.serialize();
		assert.strictEqual(
			electedClientId,
			election.electedClientId,
			`Inconsistent clientId; ${message}`,
		);
		assert.strictEqual(
			electedParentId,
			election.electedParentId,
			`Inconsistent parentId; ${message}`,
		);
		assert.strictEqual(electedClientId, expectedId, `Invalid clientId; ${message}`);
		assert.strictEqual(electedParentId, expectedParentId, `Invalid parentId; ${message}`);
		assert.strictEqual(electionSequenceNumber, expectedSeq, `Invalid seq #; ${message}`);
	}

	afterEach(() => {
		mockLogger.clear();
		testQuorum.reset();
		summaryCollectionEmitter.removeAllListeners();
		election.removeAllListeners();
		currentSequenceNumber = 0;
		for (const manager of summaryManagers.splice(0)) {
			manager.dispose();
		}
	});

	describe("Oldest eligible client election", () => {
		it("Should initialize with empty quorum", () => {
			createElection();
			assertState(undefined, undefined, 0, "no clients");
		});

		it("Should elect oldest eligible interactive client", () => {
			createElection([
				["s1", 1, false],
				["a", 2, true],
				["s2", 4, false],
				["b", 7, true],
			]);
			assertState("a", "a", 7, "oldest interactive");
		});

		it("Should not elect non-interactive clients", () => {
			createElection([
				["s1", 1, false],
				["s2", 4, false],
			]);
			assertState(undefined, undefined, 4, "no interactive clients");
		});

		it("Should elect when first interactive client joins empty quorum", () => {
			createElection();
			addClient("a", 10, true);
			assertState("a", "a", 10, "first interactive client elected");
		});

		it("Should not change election when younger interactive client joins", () => {
			createElection([["a", 2, true]]);
			addClient("b", 20, true);
			assertState("a", "a", 2, "older client stays elected");
		});
	});

	describe("Re-election when parent leaves", () => {
		it("Should reelect next oldest when elected parent leaves", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			assertState("a", "a", 7, "a is elected");
			removeClient("a", 5);
			assertState("b", "b", 12, "b takes over");
		});

		it("Should become undefined when last interactive client leaves", () => {
			createElection([["a", 2, true]]);
			assertState("a", "a", 2, "a is elected");
			removeClient("a", 5);
			assertState(undefined, undefined, 7, "no one to elect");
		});

		it("Should not change election when non-elected client leaves", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			removeClient("b", 5);
			assertState("a", "a", 7, "a stays elected");
		});
	});

	describe("Summarizer client in quorum", () => {
		it("Should allow a summarizer to supersede a restored interactive client with a different parent", () => {
			createElection(
				[
					["a", 1, true],
					["b", 2, true],
				],
				{ electedClientId: "b", electedParentId: "a", electionSequenceNumber: 100 },
			);
			assertState("b", "a", 100, "restored interactive identities differ");
			addClient("s", 101, false, summarizerClientType);
			assertState(
				"s",
				"a",
				101,
				"client type determines whether an incumbent summarizer exists",
			);
		});

		it("Should return summarizer as electedClientId when summarizer joins", () => {
			createElection([["a", 2, true]]);
			assertState("a", "a", 2, "parent is elected");
			addClient("a-summarizer", 10, false, summarizerClientType);
			assertState("a-summarizer", "a", 10, "summarizer is elected client");
		});

		it("Should revert to parent when summarizer leaves", () => {
			createElection([["a", 2, true]]);
			addClient("a-summarizer", 10, false, summarizerClientType);
			assertState("a-summarizer", "a", 10, "summarizer is elected");
			removeClient("a-summarizer", 5);
			assertState("a", "a", 15, "parent is elected again");
		});

		it("Should handle graceful handoff: A elected, A' joins, A leaves, B becomes parent, A' leaves", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			assertState("a", "a", 7, "A is elected parent");

			// A spawns summarizer A'
			addClient("a-summarizer", 20, false, summarizerClientType);
			assertState("a-summarizer", "a", 20, "A' is elected client");

			// A leaves
			removeClient("a", 5);
			assertState("a-summarizer", "b", 20, "B becomes parent, A' still elected client");

			// A' leaves
			removeClient("a-summarizer", 5);
			assertState("b", "b", 30, "B becomes elected client");
		});
	});

	describe("electedSummarizerChanged event", () => {
		it("Should log identity transitions including parent-only handoff, but not ignored joins or resets", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
			]);
			addClient("s", 3, false, summarizerClientType);
			addClient("other", 4, false, summarizerClientType);
			election.resetElectedClient(4);
			removeClient("a");
			removeClient("s");
			const transitions = mockLogger.events.filter(
				(event) => event.eventName === "SummarizerClientElection:ElectionChanged",
			);
			assert.equal(transitions.length, 3);
			assert.deepEqual(
				transitions.map((event) => ({
					previousElectedClientId: event.previousElectedClientId,
					previousElectedParentId: event.previousElectedParentId,
					electedClientId: event.electedClientId,
					electedParentId: event.electedParentId,
					sequenceNumber: event.sequenceNumber,
				})),
				[
					{
						previousElectedClientId: "a",
						previousElectedParentId: "a",
						electedClientId: "s",
						electedParentId: "a",
						sequenceNumber: 3,
					},
					{
						previousElectedClientId: "s",
						previousElectedParentId: "a",
						electedClientId: "s",
						electedParentId: "b",
						sequenceNumber: 5,
					},
					{
						previousElectedClientId: "s",
						previousElectedParentId: "b",
						electedClientId: "b",
						electedParentId: "b",
						sequenceNumber: 6,
					},
				],
			);
		});

		it("Should emit when parent changes", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			removeClient("a", 5);
			assert.strictEqual(eventCount, 1, "event should fire on parent change");
		});

		it("Should emit when summarizer joins", () => {
			createElection([["a", 2, true]]);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			addClient("a-summarizer", 10, false, summarizerClientType);
			assert.strictEqual(eventCount, 1, "event should fire on summarizer join");
		});

		it("Should emit when summarizer leaves", () => {
			createElection([["a", 2, true]]);
			addClient("a-summarizer", 10, false, summarizerClientType);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			removeClient("a-summarizer", 5);
			assert.strictEqual(eventCount, 1, "event should fire on summarizer leave");
		});

		it("Should not emit when non-elected non-summarizer client leaves", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			addClient("a-summarizer", 10, false, summarizerClientType);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			removeClient("b", 5);
			assert.strictEqual(eventCount, 0, "no event for non-elected, non-summarizer removal");
		});
	});

	describe("Op-counting telemetry", () => {
		it("Should log when ops exceed threshold without summary ack", () => {
			createElection([["a", 2, true]]);
			defaultOp(maxOps);
			assert.strictEqual(
				mockLogger.events.filter(
					(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
				).length,
				0,
				"should not log at max ops",
			);
			defaultOp();
			assert.strictEqual(
				mockLogger.events.filter(
					(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
				).length,
				1,
				"should log after exceeding max ops",
			);
		});

		it("Should reset op counter on summary ack", () => {
			createElection([["a", 2, true]]);
			defaultOp(maxOps);
			summaryAck();
			defaultOp(maxOps);
			assert.strictEqual(
				mockLogger.events.filter(
					(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
				).length,
				0,
				"should not log when ack resets counter",
			);
			defaultOp();
			assert.strictEqual(
				mockLogger.events.filter(
					(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
				).length,
				1,
				"should log after exceeding max ops since ack",
			);
		});
	});

	describe("Serialization", () => {
		it("Should preserve matching live and restored progress baselines through parent-only handoff after an ack", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
			]);
			addClient("s", 3, false, summarizerClientType);
			summaryAck(47);
			const restoredLogger = new MockLogger();
			const restored = new SummarizerClientElection(
				restoredLogger,
				testDeltaManager,
				testQuorum,
				summaryCollectionEmitter,
				maxOps,
				election.serialize(),
			);
			removeClient("a");
			assertState("s", "b", 50, "parent-only handoff retains ack progress");
			assert.deepEqual(restored.serialize(), election.serialize());
			const warnings = (logger: MockLogger) =>
				logger.events.filter(
					(event) =>
						event.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
				);
			defaultOp(maxOps - 1);
			assert.equal(warnings(mockLogger).length, 0);
			assert.equal(warnings(restoredLogger).length, 0);
			defaultOp();
			for (const logger of [mockLogger, restoredLogger]) {
				assert.deepEqual(
					warnings(logger).map((event) => ({
						opsWithoutSummary: event.opsWithoutSummary,
						electedClientId: event.electedClientId,
					})),
					[{ opsWithoutSummary: maxOps + 1, electedClientId: "s" }],
				);
			}
			assert.deepEqual(restored.serialize(), election.serialize());
			removeClient("s");
			assert.deepEqual(restored.serialize(), election.serialize());
			assertState(
				"b",
				"b",
				currentSequenceNumber,
				"client transition starts a new progress baseline",
			);
		});

		for (const firstToLeave of ["summarizer-1", "summarizer-2"]) {
			it(`Should agree with a restored observer when ${firstToLeave} leaves first`, () => {
				createElection([
					["a", 1, true],
					["b", 2, true],
				]);
				addClient("summarizer-1", 3, false, summarizerClientType);
				addClient("summarizer-2", 4, false, summarizerClientType);
				const restored = new SummarizerClientElection(
					mockLogger,
					testDeltaManager,
					testQuorum,
					summaryCollectionEmitter,
					maxOps,
					election.serialize(),
				);
				assert.deepEqual(restored.serialize(), election.serialize());
				assert.equal(election.electedClientId, "summarizer-1");
				removeClient("a");
				assert.deepEqual(restored.serialize(), election.serialize());
				removeClient(firstToLeave);
				assert.deepEqual(restored.serialize(), election.serialize());
				removeClient(firstToLeave === "summarizer-1" ? "summarizer-2" : "summarizer-1");
				assert.deepEqual(restored.serialize(), election.serialize());
				assert.equal(election.electedClientId, "b");
			});
		}

		it("Should restore the recorded summarizer even when an older summarizer is in quorum", () => {
			addClient("a", 1);
			addClient("older", 2, false, summarizerClientType);
			addClient("recorded", 3, false, summarizerClientType);
			createElection([], {
				electedClientId: "recorded",
				electedParentId: "a",
				electionSequenceNumber: 3,
			});
			assertState("recorded", "a", 3, "serialized election identity retained");
		});

		it("Should preserve the ack baseline on ignored joins and no-op resets", () => {
			createElection([["a", 1, true]]);
			addClient("s", 2, false, summarizerClientType);
			summaryAck(10);
			const state = election.serialize();
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			addClient("other", 13, false, summarizerClientType);
			election.resetElectedClient(14);
			assert.deepEqual(election.serialize(), state);
			assert.equal(eventCount, 0);
			defaultOp(maxOps + 1);
			assert.equal(election.electedClientId, "s");
			assert.equal(eventCount, 0);
		});

		it("Should serialize and restore correctly", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			const serialized = election.serialize();
			assert.strictEqual(serialized.electedClientId, "a");
			assert.strictEqual(serialized.electedParentId, "a");
		});

		it("Should restore from serialized state", () => {
			createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 100 },
			);
			assertState("b", "b", 100, "restored from serialized state");
		});

		it("Should recover on the next op when serialized client and parent are missing", () => {
			createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "x", electedParentId: "x", electionSequenceNumber: 100 },
			);
			assertState(undefined, undefined, 100, "missing elected client remains undefined");
			defaultOp();
			assertState("a", "a", 101, "recovered on the next op");
		});

		it("Should use summary ack seq in serialization when available", () => {
			createElection([["a", 2, true]]);
			summaryAck(50);
			const serialized = election.serialize();
			assert.strictEqual(serialized.electionSequenceNumber, 52, "uses ack seq");
		});
	});

	describe("Recovery", () => {
		it("Should recover when electedClientId is undefined but eligible clients exist", () => {
			createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 100,
			});
			assertState(undefined, undefined, 100, "no elected client initially");
			addClient("a", 110, true);
			assertState("a", "a", 110, "auto-elect on add");
		});

		it("Should auto-elect on op when eligible clients exist but none elected", () => {
			currentSequenceNumber = 100;
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
				],
				{
					electedClientId: undefined,
					electedParentId: undefined,
					electionSequenceNumber: 50,
				},
			);
			assertState(undefined, undefined, 50, "initial state is undefined");
			defaultOp();
			assertState("a", "a", 101, "auto-elect on op");
		});
	});

	describe("Edge cases", () => {
		it("Should handle empty quorum throughout", () => {
			createElection();
			defaultOp(100);
			assertState(undefined, undefined, 0, "still undefined");
		});

		it("Should handle all clients leave", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			removeClient("a", 5);
			removeClient("b", 5);
			assertState(undefined, undefined, 17, "no clients left");
		});

		it("Should handle summarizer outliving parent", () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			addClient("a-summarizer", 20, false, summarizerClientType);
			removeClient("a", 5);
			assertState("a-summarizer", "b", 20, "summarizer outlives parent");
			removeClient("b", 5);
			assertState("a-summarizer", undefined, 20, "no parent, summarizer still alive");
			removeClient("a-summarizer", 5);
			assertState(undefined, undefined, 35, "everything gone");
		});

		it("Should pick up summarizer already in quorum at construction time", () => {
			// Add clients including a summarizer before creating the election
			addClient("a", 2, true);
			addClient("a-summarizer", 10, false, summarizerClientType);
			election = new SummarizerClientElection(
				mockLogger.toTelemetryLogger(),
				testDeltaManager,
				testQuorum,
				summaryCollectionEmitter,
				maxOps,
				currentSequenceNumber,
			);
			assertState("a-summarizer", "a", 10, "summarizer detected at construction");
		});

		it("Should retain the elected summarizer when a second summarizer joins", () => {
			createElection([["a", 2, true]]);
			addClient("summarizer-1", 10, false, summarizerClientType);
			assertState("summarizer-1", "a", 10, "first summarizer is elected client");

			addClient("summarizer-2", 20, false, summarizerClientType);
			assertState("summarizer-1", "a", 10, "second summarizer does not replace incumbent");

			removeClient("summarizer-2", 5);
			assertState("summarizer-1", "a", 10, "removing unelected summarizer has no effect");

			// Removing the tracked summarizer reverts to parent
			removeClient("summarizer-1", 5);
			assertState("a", "a", 30, "parent is elected again after tracked summarizer leaves");
		});
	});

	describe("Initialization from serialized state", () => {
		it("Should advance past an ineligible serialized client and parent", () => {
			// "s1" is non-interactive and non-summarizer, so ineligible
			createElection(
				[
					["s1", 1, false],
					["a", 5, true],
				],
				{ electedClientId: "s1", electedParentId: "s1", electionSequenceNumber: 100 },
			);
			assertState("a", "a", 100, "fell back to oldest eligible");
		});

		it("Should use electedClientId as parent when electedParentId is undefined (backward compat)", () => {
			createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: undefined, electionSequenceNumber: 100 },
			);
			assertState("b", "b", 100, "electedClientId used as parent");
		});

		it("Should not use electedClientId as parent when it is a summarizer type", () => {
			addClient("a", 2, true);
			addClient("a-summarizer", 10, false, summarizerClientType);
			election = new SummarizerClientElection(
				mockLogger.toTelemetryLogger(),
				testDeltaManager,
				testQuorum,
				summaryCollectionEmitter,
				maxOps,
				{
					electedClientId: "a-summarizer",
					electedParentId: undefined,
					electionSequenceNumber: 100,
				},
			);
			assertState("a-summarizer", undefined, 100, "summarizer not used as parent");
		});

		it("Should select the next eligible client when electedClientId is ineligible", () => {
			// "s1" is in quorum, matches electedClientId, but is ineligible
			createElection(
				[
					["s1", 1, false],
					["a", 5, true],
				],
				{ electedClientId: "s1", electedParentId: "s1", electionSequenceNumber: 100 },
			);
			assertState("a", "a", 100, "next eligible client elected");
			mockLogger.assertMatchNone([
				{ eventName: "SummarizerClientElection:InitialElectedClientNotFound" },
			]);
		});

		it("Should log error when electedClientId is not found in quorum", () => {
			createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "x", electedParentId: "x", electionSequenceNumber: 100 },
			);
			assertState(undefined, undefined, 100, "missing elected client remains undefined");
			mockLogger.assertMatch([
				{
					eventName: "SummarizerClientElection:InitialElectedClientNotFound",
					expectedClientId: "x",
				},
			]);
		});
	});

	describe("clientDetailsPermitElection", () => {
		function makeDetails(
			interactive: boolean,
			type?: string,
		): ISequencedClient["client"]["details"] {
			const details: ISequencedClient["client"]["details"] = {
				capabilities: { interactive },
			};
			if (type !== undefined) {
				details.type = type;
			}
			return details;
		}

		it("Should permit interactive clients", () => {
			assert.strictEqual(
				SummarizerClientElection.clientDetailsPermitElection(makeDetails(true)),
				true,
			);
		});

		it("Should permit summarizer-type clients", () => {
			assert.strictEqual(
				SummarizerClientElection.clientDetailsPermitElection(
					makeDetails(false, summarizerClientType),
				),
				true,
			);
		});

		it("Should reject non-interactive non-summarizer clients", () => {
			assert.strictEqual(
				SummarizerClientElection.clientDetailsPermitElection(makeDetails(false)),
				false,
			);
		});
	});

	describe("Client eligibility edge cases", () => {
		it("Should elect interactive client with no type set (standard case)", () => {
			// Client with interactive capability but no type field — the common case
			const details: ISequencedClient["client"]["details"] = {
				capabilities: { interactive: true },
			};
			const c: Partial<ISequencedClient["client"]> = { details };
			const client: ISequencedClient = {
				client: c as ISequencedClient["client"],
				sequenceNumber: 5,
			};
			testQuorum.addClient("a", client);
			currentSequenceNumber = 5;
			election = new SummarizerClientElection(
				mockLogger.toTelemetryLogger(),
				testDeltaManager,
				testQuorum,
				summaryCollectionEmitter,
				maxOps,
				currentSequenceNumber,
			);
			assertState("a", "a", 5, "interactive client with no type is eligible");
		});

		it("Should not elect ineligible client when no parent is elected", () => {
			createElection();
			// Add a non-interactive, non-summarizer client — it is ineligible
			addClient("bot", 10, false);
			assertState(undefined, undefined, 0, "ineligible client not elected");
		});
	});

	describe("Op telemetry deduplication", () => {
		it("Should not log duplicate telemetry within the same window", () => {
			createElection([["a", 2, true]]);
			// Exceed threshold to trigger first log
			defaultOp(maxOps + 1);
			const firstCount = mockLogger.events.filter(
				(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
			).length;
			assert.strictEqual(firstCount, 1, "should log once after exceeding threshold");

			// Send more ops within the same maxOps window — should NOT log again
			defaultOp(maxOps - 1);
			const secondCount = mockLogger.events.filter(
				(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
			).length;
			assert.strictEqual(secondCount, 1, "should not log again within same window");

			// Exceed the next window — should log again
			defaultOp(2);
			const thirdCount = mockLogger.events.filter(
				(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
			).length;
			assert.strictEqual(thirdCount, 2, "should log again after next window");
		});
	});

	describe("Integration with SummaryManager", () => {
		it("Should spawn summarizer and handle graceful handoff", async () => {
			createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			const a = createManager("a");
			const b = createManager("b");
			assertState("a", "a", 7, "a elected");
			a.connectedState.connect();
			b.connectedState.connect();
			await flushPromises();
			assertState("a-summarizer", "a", 7, "a's summarizer elected on connect");
			assert.equal(a.summarizers.length, 1);
			assert.equal(b.summarizers.length, 0);
			const summarizer = a.summarizers[0];
			assert(summarizer !== undefined);

			// A leaves, B becomes parent, but A' still working
			removeClient("a", 5);
			a.connectedState.disconnect();
			assertState("a-summarizer", "b", 7, "summarizer still doing work");
			assert.equal(await summarizer.stopDeferred.promise, "notElectedParent");
			assert.equal(b.summarizers.length, 0, "B waits for the incumbent's quorum departure");

			// A' finishes
			summarizer.runDeferred.resolve();
			await flushPromises();
			assert.equal(a.connectedState.clientId, "a");
			assert.equal(b.connectedState.clientId, "b");
			assert.equal(a.summarizers.length, 1, "A does not create B's child");
			assert.equal(b.summarizers.length, 1);
			assertState("b-summarizer", "b", 12, "b's summarizer elected");
		});

		it("Should auto-elect on op when initial state has undefined client", async () => {
			currentSequenceNumber = 678;
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
					["s2", 4, false],
					["b", 7, true],
				],
				{
					electedClientId: undefined,
					electedParentId: undefined,
					electionSequenceNumber: 432,
				},
			);
			const a = createManager("a");
			assertState(undefined, undefined, 432, "no elected client at first");
			defaultOp();
			assertState("a", "a", 679, "auto-elect first eligible client");
			a.connectedState.connect();
			await flushPromises();
			assertState("a-summarizer", "a", 679, "a's summarizer elected on connect");
		});

		it("Should handle add/remove clients with initial state", async () => {
			createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 12,
			});
			const a = createManager("a");
			assertState(undefined, undefined, 12, "initially undefined");

			addClient("s1", 1, false);
			assertState(undefined, undefined, 12, "non-interactive doesn't trigger election");

			addClient("a", 17, true);
			assertState("a", "a", 17, "first interactive client elected");
			a.connectedState.connect();
			await flushPromises();
			assertState("a-summarizer", "a", 17, "a's summarizer elected");

			addClient("s2", 19, false);
			addClient("b", 41, true);
			assertState("a-summarizer", "a", 17, "younger clients have no effect");

			removeClient("a", 400);
			a.connectedState.disconnect();
			assertState("a-summarizer", "b", 17, "summarizer still doing work");
			const summarizer = a.summarizers[0];
			assert(summarizer !== undefined);
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState("b", "b", 441, "next oldest client elected after summarizer leaves");
		});
	});
});
