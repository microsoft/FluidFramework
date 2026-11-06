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
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
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
	const elections: SummarizerClientElection[] = [];
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
			// Approximation, as ideally it should become cancelled immediately after stop() call
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
		logger: ITelemetryBaseLogger = mockLogger.toTelemetryLogger(),
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
		const election = new SummarizerClientElection(
			logger,
			testDeltaManager,
			testQuorum,
			summaryCollectionEmitter,
			maxOps,
			initialState?.electionSequenceNumber ?? currentSequenceNumber,
		);
		elections.push(election);
		return election;
	}

	function createManager(election: SummarizerClientElection, parentId: string) {
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
		election: SummarizerClientElection,
		expectedId: string | undefined,
		expectedParentId: string | undefined,
		expectedSeq: number,
		message: string,
	) {
		const { electedClientId, electedParentId, electionSequenceNumber } = election.serialize();
		// The serialized client ID is retained for compatibility, not child election.
		assert.strictEqual(
			election.summarizerExistsInQuorum,
			expectedId !== undefined && expectedId !== expectedParentId,
			`Invalid summarizer presence; ${message}`,
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
		for (const election of elections.splice(0)) {
			election.removeAllListeners();
		}
		currentSequenceNumber = 0;
		for (const manager of summaryManagers.splice(0)) {
			manager.dispose();
		}
	});

	describe("Oldest eligible client election", () => {
		it("Should elect by join sequence regardless of quorum insertion order", () => {
			const election = createElection([
				["b", 5, true],
				["bot", 1, false],
				["a", 2, true],
			]);
			assertState(election, "a", "a", 5, "oldest eligible parent");
			removeClient("a");
			assertState(election, "b", "b", 6, "oldest remaining parent");
		});

		it("Should initialize with empty quorum", () => {
			const election = createElection();
			assertState(election, undefined, undefined, 0, "no clients");
		});

		it("Should elect oldest eligible interactive client", () => {
			const election = createElection([
				["s1", 1, false],
				["a", 2, true],
				["s2", 4, false],
				["b", 7, true],
			]);
			assertState(election, "a", "a", 7, "oldest interactive");
		});

		it("Should not elect non-interactive clients", () => {
			const election = createElection([
				["s1", 1, false],
				["s2", 4, false],
			]);
			assertState(election, undefined, undefined, 4, "no interactive clients");
		});

		it("Should elect when first interactive client joins empty quorum", () => {
			const election = createElection();
			addClient("a", 10, true);
			assertState(election, "a", "a", 10, "first interactive client elected");
		});

		it("Should not change election when younger interactive client joins", () => {
			const election = createElection([["a", 2, true]]);
			addClient("b", 20, true);
			assertState(election, "a", "a", 2, "older client stays elected");
		});
	});

	describe("Re-election when parent leaves", () => {
		it("Should reelect next oldest when elected parent leaves", () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			assertState(election, "a", "a", 7, "a is elected");
			removeClient("a", 5);
			assertState(election, "b", "b", 12, "b takes over");
		});

		it("Should become undefined when last interactive client leaves", () => {
			const election = createElection([["a", 2, true]]);
			assertState(election, "a", "a", 2, "a is elected");
			removeClient("a", 5);
			assertState(election, undefined, undefined, 7, "no one to elect");
		});

		it("Should not change election when non-elected client leaves", () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			removeClient("b", 5);
			assertState(election, "a", "a", 7, "a stays elected");
		});
	});

	describe("Summarizer client in quorum", () => {
		it("Should derive the oldest parent and observe a summarizer despite recorded interactive identities", () => {
			const election = createElection(
				[
					["a", 1, true],
					["b", 2, true],
				],
				{ electedClientId: "b", electedParentId: "a", electionSequenceNumber: 100 },
			);
			assertState(
				election,
				"a",
				"a",
				100,
				"parent comes from quorum rather than recorded identities",
			);
			addClient("s", 101, false, summarizerClientType);
			assertState(election, "s", "a", 101, "summarizer presence comes from quorum");
		});

		it("Should report a summarizer in quorum when summarizer joins", () => {
			const election = createElection([["a", 2, true]]);
			assertState(election, "a", "a", 2, "parent is elected");
			addClient("a-summarizer", 10, false, summarizerClientType);
			assertState(election, "a-summarizer", "a", 10, "summarizer is present");
		});

		it("Should report no summarizer in quorum when the last summarizer leaves", () => {
			const election = createElection([["a", 2, true]]);
			addClient("a-summarizer", 10, false, summarizerClientType);
			assertState(election, "a-summarizer", "a", 10, "summarizer is present");
			removeClient("a-summarizer", 5);
			assertState(election, "a", "a", 15, "parent may create a replacement");
		});

		it("Should handle graceful handoff: A elected, A' joins, A leaves, B becomes parent, A' leaves", () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			assertState(election, "a", "a", 7, "A is elected parent");

			// A spawns summarizer A'
			addClient("a-summarizer", 20, false, summarizerClientType);
			assertState(election, "a-summarizer", "a", 20, "A' is present in quorum");

			// A leaves
			removeClient("a", 5);
			assertState(election, "a-summarizer", "b", 20, "B becomes parent, A' remains in quorum");

			// A' leaves
			removeClient("a-summarizer", 5);
			assertState(election, "b", "b", 30, "B may create a replacement");
		});
	});

	describe("electedSummarizerChanged event", () => {
		it("Should log parent and summarizer-presence transitions, but not irrelevant joins or leaves", () => {
			createElection([
				["a", 1, true],
				["b", 2, true],
			]);
			addClient("s", 3, false, summarizerClientType);
			addClient("other", 4, false, summarizerClientType); // Ignored join.
			removeClient("a");
			removeClient("s");
			removeClient("other");
			const transitions = mockLogger.events.filter(
				(event) => event.eventName === "SummarizerClientElection:ElectionChanged",
			);
			assert.equal(transitions.length, 3);
			assert.deepEqual(
				transitions.map((event) => ({
					previousElectedParentId: event.previousElectedParentId,
					electedParentId: event.electedParentId,
					previousSummarizerExistsInQuorum: event.previousSummarizerExistsInQuorum,
					summarizerExistsInQuorum: event.summarizerExistsInQuorum,
					sequenceNumber: event.sequenceNumber,
				})),
				[
					{
						previousElectedParentId: "a",
						electedParentId: "a",
						previousSummarizerExistsInQuorum: false,
						summarizerExistsInQuorum: true,
						sequenceNumber: 3,
					},
					{
						previousElectedParentId: "a",
						electedParentId: "b",
						previousSummarizerExistsInQuorum: true,
						summarizerExistsInQuorum: true,
						sequenceNumber: 5,
					},
					{
						previousElectedParentId: "b",
						electedParentId: "b",
						previousSummarizerExistsInQuorum: true,
						summarizerExistsInQuorum: false,
						sequenceNumber: 7,
					},
				],
			);
		});

		it("Should emit when parent changes", () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			removeClient("a", 5);
			assert.strictEqual(eventCount, 1, "event should fire on parent change");
		});

		it("Should emit when summarizer joins", () => {
			const election = createElection([["a", 2, true]]);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			addClient("a-summarizer", 10, false, summarizerClientType);
			assert.strictEqual(eventCount, 1, "event should fire on summarizer join");
		});

		it("Should emit when summarizer leaves", () => {
			const election = createElection([["a", 2, true]]);
			addClient("a-summarizer", 10, false, summarizerClientType);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			removeClient("a-summarizer", 5);
			assert.strictEqual(eventCount, 1, "event should fire on summarizer leave");
		});

		it("Should not emit when non-elected non-summarizer client leaves", () => {
			const election = createElection([
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
		it("Should report a stalled child through repeated parent departures", () => {
			const election = createElection([
				["a", 1, true],
				["b", 2, true],
				["c", 3, true],
			]);
			addClient("s", 4, false, summarizerClientType);
			summaryAck();
			const baseline = currentSequenceNumber;
			defaultOp(900);
			removeClient("a");
			defaultOp(900);
			removeClient("b");
			defaultOp(900);
			assertState(
				election,
				"s",
				"c",
				baseline,
				"parent departures do not hide stalled progress",
			);
			assert.equal(
				mockLogger.events.filter(
					(event) =>
						event.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
				).length,
				1,
			);
		});

		it("Should reset the progress baseline when summarizer presence changes or a parent changes without children", () => {
			const election = createElection([
				["a", 1, true],
				["b", 2, true],
				["c", 3, true],
			]);
			summaryAck();
			addClient("s1", 10, false, summarizerClientType);
			assertState(election, "s1", "a", 10, "first child resets the baseline");
			summaryAck();
			const ackSequenceNumber = currentSequenceNumber;
			addClient("s2", 20, false, summarizerClientType);
			removeClient("s1");
			assertState(
				election,
				"s2",
				"a",
				ackSequenceNumber,
				"remaining child keeps the baseline",
			);
			removeClient("a");
			assertState(election, "s2", "b", ackSequenceNumber, "parent handoff keeps the baseline");
			removeClient("s2");
			assertState(
				election,
				"b",
				"b",
				currentSequenceNumber,
				"last departure resets the baseline",
			);
			summaryAck();
			removeClient("b");
			assertState(
				election,
				"c",
				"c",
				currentSequenceNumber,
				"new parent without a child resets the baseline",
			);
		});

		it("Should preserve the quorum-derived election across repeated excess-op warnings", () => {
			const election = createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 100 },
			);
			assertState(election, "a", "a", 100, "oldest parent replaces recorded younger parent");
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			defaultOp(maxOps);
			assertState(election, "a", "a", 100, "election unchanged at threshold");
			defaultOp();
			assertState(election, "a", "a", 100, "election unchanged after first excess-op warning");
			defaultOp(maxOps + 1);
			assertState(
				election,
				"a",
				"a",
				100,
				"election unchanged after second excess-op warning",
			);
			assert.equal(eventCount, 0, "excess ops should not emit election changes");
		});

		it("Should preserve the quorum-derived election across repeated excess-op warnings after an ack", () => {
			const election = createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 100 },
			);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			defaultOp(maxOps + 1);
			assertState(election, "a", "a", 100, "election unchanged before ack");
			summaryAck();
			const ackSequenceNumber = currentSequenceNumber;
			assertState(
				election,
				"a",
				"a",
				ackSequenceNumber,
				"ack advances only the progress baseline",
			);
			defaultOp(maxOps);
			assertState(
				election,
				"a",
				"a",
				ackSequenceNumber,
				"election unchanged at threshold after ack",
			);
			defaultOp();
			assertState(
				election,
				"a",
				"a",
				ackSequenceNumber,
				"election unchanged after first excess-op warning",
			);
			defaultOp(maxOps + 1);
			assertState(
				election,
				"a",
				"a",
				ackSequenceNumber,
				"election unchanged after second excess-op warning",
			);
			assert.equal(
				eventCount,
				0,
				"excess ops and summary acks should not emit election changes",
			);
		});

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
		it("Should preserve the compatibility snapshot shape with a parent only", () => {
			const election = createElection([["a", 1, true]], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 50,
			});
			assertState(election, "a", "a", 50, "parent supplies both compatibility identities");
			assert.deepEqual(JSON.parse(JSON.stringify(election.serialize())), {
				electionSequenceNumber: 50,
				electedClientId: "a",
				electedParentId: "a",
			});
		});

		it("Should preserve the compatibility snapshot shape with a child only", () => {
			addClient("s", 1, false, summarizerClientType);
			const election = createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 50,
			});
			assertState(
				election,
				"s",
				undefined,
				50,
				"child supplies the compatibility client identity",
			);
			assert.deepEqual(JSON.parse(JSON.stringify(election.serialize())), {
				electionSequenceNumber: 50,
				electedClientId: "s",
			});
		});

		it("Should preserve the compatibility snapshot shape with an empty quorum", () => {
			const election = createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 50,
			});
			assertState(election, undefined, undefined, 50, "no compatibility identities");
			assert.deepEqual(JSON.parse(JSON.stringify(election.serialize())), {
				electionSequenceNumber: 50,
			});
		});

		it("Should derive the oldest parent and observe the child from a legacy younger-parent snapshot", () => {
			const election = createElection([
				["a", 1, true],
				["b", 2, true],
			]);
			addClient("s", 3, false, summarizerClientType);
			const legacyState: ISerializedElection = {
				electedClientId: "s",
				electedParentId: "b",
				electionSequenceNumber: 50,
			};
			const restored = createElection([], legacyState);
			assertState(
				restored,
				"s",
				"a",
				50,
				"new observer derives A and observes the child in quorum",
			);
			assert.deepEqual(restored.serialize(), {
				electedClientId: "s",
				electedParentId: "a",
				electionSequenceNumber: 50,
			});
			const roundTripped = createElection([], restored.serialize());
			assert.deepEqual(roundTripped.serialize(), restored.serialize());
			removeClient("s");
			assertState(
				restored,
				"a",
				"a",
				51,
				"oldest parent may create a child after the last departure",
			);
			assert.deepEqual(roundTripped.serialize(), restored.serialize());
			assert.equal(election.summarizerExistsInQuorum, false);
		});

		it("Should observe an existing summarizer when no client was recorded", () => {
			addClient("a", 1);
			addClient("s", 2, false, summarizerClientType);
			const election = createElection([], {
				electedClientId: undefined,
				electedParentId: "missing",
				electionSequenceNumber: 50,
			});
			assertState(election, "s", "a", 50, "existing child prevents replacement creation");
		});

		it("Should observe an existing summarizer when the recorded client is missing", () => {
			addClient("a", 1);
			addClient("s", 2, false, summarizerClientType);
			const election = createElection([], {
				electedClientId: "missing",
				electedParentId: "missing",
				electionSequenceNumber: 50,
			});
			assertState(election, "s", "a", 50, "existing child prevents replacement creation");
		});

		it("Should preserve matching live and restored progress baselines through parent-only handoff after an ack", () => {
			const election = createElection([
				["a", 1, true],
				["b", 2, true],
			]);
			addClient("s", 3, false, summarizerClientType);
			summaryAck(47);
			const restoredLogger = new MockLogger();
			const restored = createElection([], election.serialize(), restoredLogger);
			removeClient("a");
			assertState(election, "s", "b", 50, "parent-only handoff retains ack progress");
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
			function assertProgressWarning(logger: MockLogger, observer: string): void {
				assert.deepEqual(
					warnings(logger).map((event) => ({
						opsWithoutSummary: event.opsWithoutSummary,
						electedClientId: event.electedClientId,
						electedParentId: event.electedParentId,
						summarizerExistsInQuorum: event.summarizerExistsInQuorum,
						electionSequenceNumber: event.electionSequenceNumber,
					})),
					[
						{
							opsWithoutSummary: maxOps + 1,
							electedClientId: "s",
							electedParentId: "b",
							summarizerExistsInQuorum: true,
							electionSequenceNumber: 50,
						},
					],
					`${observer} reports the retained ack baseline`,
				);
			}
			assertProgressWarning(mockLogger, "live observer");
			assertProgressWarning(restoredLogger, "restored observer");
			assert.deepEqual(restored.serialize(), election.serialize());
			removeClient("s");
			assert.deepEqual(restored.serialize(), election.serialize());
			assertState(
				election,
				"b",
				"b",
				currentSequenceNumber,
				"client transition starts a new progress baseline",
			);
		});

		for (const firstToLeave of ["summarizer-1", "summarizer-2"]) {
			it(`Should agree with a restored observer when ${firstToLeave} leaves first`, () => {
				const election = createElection([
					["a", 1, true],
					["b", 2, true],
				]);
				addClient("summarizer-1", 3, false, summarizerClientType);
				addClient("summarizer-2", 4, false, summarizerClientType);
				const restored = createElection([], election.serialize(), mockLogger);
				assert.deepEqual(restored.serialize(), election.serialize());
				assert.equal(election.summarizerExistsInQuorum, true);
				removeClient("a");
				assert.deepEqual(restored.serialize(), election.serialize());
				removeClient(firstToLeave);
				assert.equal(election.summarizerExistsInQuorum, true);
				assert.deepEqual(restored.serialize(), election.serialize());
				removeClient(firstToLeave === "summarizer-1" ? "summarizer-2" : "summarizer-1");
				assert.deepEqual(restored.serialize(), election.serialize());
				assert.equal(election.summarizerExistsInQuorum, false);
			});
		}

		it("Should serialize the oldest summarizer for compatibility regardless of recorded identity", () => {
			addClient("a", 1);
			addClient("older", 2, false, summarizerClientType);
			addClient("recorded", 3, false, summarizerClientType);
			const election = createElection([], {
				electedClientId: "recorded",
				electedParentId: "a",
				electionSequenceNumber: 3,
			});
			assertState(
				election,
				"older",
				"a",
				3,
				"oldest child represents quorum for older readers",
			);
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			removeClient("older");
			assertState(election, "recorded", "a", 3, "remaining child preserves progress baseline");
			assert.equal(eventCount, 0);
		});

		it("Should preserve the ack baseline on irrelevant membership changes", () => {
			const election = createElection([["a", 1, true]]);
			addClient("s", 2, false, summarizerClientType);
			summaryAck(10);
			const state = election.serialize();
			let eventCount = 0;
			election.on("electedSummarizerChanged", () => eventCount++);
			addClient("other", 13, false, summarizerClientType);
			assert.deepEqual(election.serialize(), state);
			assert.equal(eventCount, 0);
			defaultOp(maxOps + 1);
			removeClient("s");
			assert.equal(election.summarizerExistsInQuorum, true);
			assert.equal(election.serialize().electionSequenceNumber, state.electionSequenceNumber);
			assert.equal(eventCount, 0);
		});

		it("Should serialize and restore correctly", () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			const serialized = election.serialize();
			assert.strictEqual(serialized.electedClientId, "a");
			assert.strictEqual(serialized.electedParentId, "a");
		});

		it("Should derive the oldest parent while retaining the serialized progress baseline", () => {
			const election = createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 100 },
			);
			assertState(election, "a", "a", 100, "quorum parent with restored progress");
		});

		it("Should recover immediately when serialized client and parent are missing", () => {
			const election = createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "x", electedParentId: "x", electionSequenceNumber: 100 },
			);
			assertState(
				election,
				"a",
				"a",
				100,
				"missing recorded identity does not delay parent election",
			);
			defaultOp();
			assertState(election, "a", "a", 100, "op preserves restored baseline");
		});

		it("Should use summary ack seq in serialization when available", () => {
			const election = createElection([["a", 2, true]]);
			summaryAck(50);
			const serialized = election.serialize();
			assert.strictEqual(serialized.electionSequenceNumber, 52, "uses ack seq");
		});
	});

	describe("Recovery", () => {
		it("Should recover when electedClientId is undefined but eligible clients exist", () => {
			const election = createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 100,
			});
			assertState(election, undefined, undefined, 100, "no elected client initially");
			addClient("a", 110, true);
			assertState(election, "a", "a", 110, "auto-elect on add");
		});

		it("Should elect on load when eligible clients exist but no identity was recorded", () => {
			currentSequenceNumber = 100;
			const election = createElection(
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
			assertState(election, "a", "a", 50, "parent derived on load");
			defaultOp();
			assertState(election, "a", "a", 50, "op preserves baseline");
		});
	});

	describe("Edge cases", () => {
		it("Should handle empty quorum throughout", () => {
			const election = createElection();
			defaultOp(100);
			assertState(election, undefined, undefined, 0, "still undefined");
		});

		it("Should handle all clients leave", () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			removeClient("a", 5);
			removeClient("b", 5);
			assertState(election, undefined, undefined, 17, "no clients left");
		});

		it("Should handle summarizer outliving parent", () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			addClient("a-summarizer", 20, false, summarizerClientType);
			removeClient("a", 5);
			assertState(election, "a-summarizer", "b", 20, "summarizer outlives parent");
			removeClient("b", 5);
			assertState(
				election,
				"a-summarizer",
				undefined,
				20,
				"no parent, summarizer still alive",
			);
			removeClient("a-summarizer", 5);
			assertState(election, undefined, undefined, 35, "everything gone");
		});

		it("Should pick up summarizer already in quorum at construction time", () => {
			// Add clients including a summarizer before creating the election
			addClient("a", 2, true);
			addClient("a-summarizer", 10, false, summarizerClientType);
			const election = createElection();
			assertState(election, "a-summarizer", "a", 10, "summarizer detected at construction");
		});

		it("Should keep reporting summarizer presence when a second summarizer joins", () => {
			const election = createElection([["a", 2, true]]);
			addClient("summarizer-1", 10, false, summarizerClientType);
			assertState(election, "summarizer-1", "a", 10, "first summarizer resets the baseline");

			addClient("summarizer-2", 20, false, summarizerClientType);
			assertState(
				election,
				"summarizer-1",
				"a",
				10,
				"second summarizer preserves the progress baseline",
			);

			removeClient("summarizer-2", 5);
			assertState(
				election,
				"summarizer-1",
				"a",
				10,
				"remaining summarizer preserves the progress baseline",
			);

			// The last child's departure allows the parent to create a replacement.
			removeClient("summarizer-1", 5);
			assertState(election, "a", "a", 30, "last summarizer leaves and resets the baseline");
		});
	});

	describe("Initialization from serialized state", () => {
		it("Should ignore an ineligible serialized client and parent", () => {
			// "s1" is non-interactive and non-summarizer, so ineligible
			const election = createElection(
				[
					["s1", 1, false],
					["a", 5, true],
				],
				{ electedClientId: "s1", electedParentId: "s1", electionSequenceNumber: 100 },
			);
			assertState(election, "a", "a", 100, "fell back to oldest eligible");
		});

		it("Should derive the oldest parent when electedParentId is undefined", () => {
			const election = createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: undefined, electionSequenceNumber: 100 },
			);
			assertState(
				election,
				"a",
				"a",
				100,
				"recorded interactive identity does not select parent",
			);
		});

		it("Should not use electedClientId as parent when it is a summarizer type", () => {
			addClient("a", 2, true);
			addClient("a-summarizer", 10, false, summarizerClientType);
			const election = createElection([], {
				electedClientId: "a-summarizer",
				electedParentId: undefined,
				electionSequenceNumber: 100,
			});
			assertState(election, "a-summarizer", "a", 100, "parent derived independently of child");
		});

		it("Should ignore a recorded client that is not found in quorum", () => {
			const election = createElection(
				[
					["a", 2, true],
					["b", 7, true],
				],
				{ electedClientId: "x", electedParentId: "x", electionSequenceNumber: 100 },
			);
			assertState(election, "a", "a", 100, "oldest parent replaces missing recorded client");
			mockLogger.assertMatchNone([
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
			const election = createElection();
			assertState(election, "a", "a", 5, "interactive client with no type is eligible");
		});

		it("Should not elect ineligible client when no parent is elected", () => {
			const election = createElection();
			// Add a non-interactive, non-summarizer client — it is ineligible
			addClient("bot", 10, false);
			assertState(election, undefined, undefined, 0, "ineligible client not elected");
		});
	});

	describe("Op telemetry deduplication", () => {
		it("Should not log another warning until more than maxOps ops pass since the previous warning", () => {
			createElection([["a", 2, true]]);
			// Exceed threshold to trigger first log
			defaultOp(maxOps + 1);
			const firstCount = mockLogger.events.filter(
				(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
			).length;
			assert.strictEqual(firstCount, 1, "should log once after exceeding threshold");

			// No more than maxOps ops have passed since the previous warning.
			defaultOp(maxOps - 1);
			const secondCount = mockLogger.events.filter(
				(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
			).length;
			assert.strictEqual(
				secondCount,
				1,
				"should not log again before more than maxOps ops pass",
			);

			// More than maxOps ops have now passed since the previous warning.
			defaultOp(2);
			const thirdCount = mockLogger.events.filter(
				(e) => e.eventName === "SummarizerClientElection:ElectedClientNotSummarizing",
			).length;
			assert.strictEqual(thirdCount, 2, "should log again after more than maxOps ops pass");
		});

		it("Should not log progress warnings for an empty election", () => {
			createElection();
			defaultOp(5000);
			mockLogger.assertMatchNone([
				{ eventName: "SummarizerClientElection:ElectedClientNotSummarizing" },
			]);
		});
	});

	describe("Integration with SummaryManager", () => {
		it("Should spawn summarizer and handle graceful handoff", async () => {
			const election = createElection([
				["a", 2, true],
				["b", 7, true],
			]);
			const a = createManager(election, "a");
			const b = createManager(election, "b");
			assertState(election, "a", "a", 7, "a elected");
			a.connectedState.connect();
			b.connectedState.connect();
			await flushPromises();
			assertState(election, "a-summarizer", "a", 7, "a's summarizer elected on connect");
			assert.equal(a.summarizers.length, 1);
			assert.equal(b.summarizers.length, 0);
			const summarizer = a.summarizers[0];
			assert(summarizer !== undefined);

			// A leaves, B becomes parent, but A' still working
			removeClient("a", 5);
			a.connectedState.disconnect();
			assertState(election, "a-summarizer", "b", 7, "summarizer still doing work");
			assert.equal(await summarizer.stopDeferred.promise, "notElectedParent");
			assert.equal(b.summarizers.length, 0, "B waits for the child's quorum departure");

			// A' finishes
			summarizer.runDeferred.resolve();
			await flushPromises();
			assert.equal(a.connectedState.clientId, "a");
			assert.equal(b.connectedState.clientId, "b");
			assert.equal(a.summarizers.length, 1, "A does not create B's child");
			assert.equal(b.summarizers.length, 1);
			assertState(election, "b-summarizer", "b", 12, "b's summarizer elected");
		});

		it("Should elect on load when initial state has undefined client", async () => {
			currentSequenceNumber = 678;
			const election = createElection(
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
			const a = createManager(election, "a");
			assertState(election, "a", "a", 432, "parent elected on load");
			defaultOp();
			assertState(election, "a", "a", 432, "op does not change progress baseline");
			a.connectedState.connect();
			await flushPromises();
			assertState(election, "a-summarizer", "a", 679, "a's summarizer elected on connect");
		});

		it("Should handle add/remove clients with initial state", async () => {
			const election = createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 12,
			});
			const a = createManager(election, "a");
			assertState(election, undefined, undefined, 12, "initially undefined");

			addClient("s1", 1, false);
			assertState(
				election,
				undefined,
				undefined,
				12,
				"non-interactive doesn't trigger election",
			);

			addClient("a", 17, true);
			assertState(election, "a", "a", 17, "first interactive client elected");
			a.connectedState.connect();
			await flushPromises();
			assertState(election, "a-summarizer", "a", 17, "a's summarizer elected");

			addClient("s2", 19, false);
			addClient("b", 41, true);
			assertState(election, "a-summarizer", "a", 17, "younger clients have no effect");

			removeClient("a", 400);
			a.connectedState.disconnect();
			assertState(election, "a-summarizer", "b", 17, "summarizer still doing work");
			const summarizer = a.summarizers[0];
			assert(summarizer !== undefined);
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState(
				election,
				"b",
				"b",
				441,
				"next oldest client elected after summarizer leaves",
			);
		});
	});
});
