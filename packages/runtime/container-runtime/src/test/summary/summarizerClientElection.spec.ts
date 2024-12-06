/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	ISummarizerEvents,
	SummarizerStopReason,
} from "@fluidframework/container-runtime-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { ISequencedClient } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	IConnectedEvents,
	IConnectedState,
	ISerializedElection,
	ISummarizer,
	ISummaryCollectionOpEvents,
	OrderedClientCollection,
	OrderedClientElection,
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
	let refreshSummarizerCallCount = 0;
	const summaryCollectionEmitter = new TypedEventEmitter<ISummaryCollectionOpEvents>();
	let election: SummarizerClientElection;
	let summaryManager: SummaryManager;

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
		public clientId: string | undefined;

		public connect() {
			this.connected = true;
			this.clientId = election.electedParentId;
			this.emit("connected", this.clientId);
		}

		public disconnect() {
			this.connected = false;
			this.emit("disconnected");
		}
	}

	class TestSummarizer extends TypedEventEmitter<ISummarizerEvents> implements ISummarizer {
		private notImplemented(): never {
			throw Error("not implemented");
		}
		public onBehalfOf: string | undefined;
		public state: "notStarted" | "running" | "stopped" = "notStarted";
		public readonly stopDeferred = new Deferred<string | undefined>();
		public readonly runDeferred = new Deferred<void>();
		public clientId: string | undefined;

		constructor() {
			super();
		}
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

	let connectedState: TestConnectedState;
	let summarizer: TestSummarizer;

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

	const requestSummarizer = async (): Promise<ISummarizer> => {
		summarizer = new TestSummarizer();
		const parentId = election.electedParentId;
		const clientId = `${parentId}-summarizer`;
		summarizer.clientId = clientId;
		addClient(clientId, currentSequenceNumber, false, summarizerClientType);
		return summarizer;
	};

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
		election = new SummarizerClientElection(
			mockLogger.toTelemetryLogger(),
			summaryCollectionEmitter,
			new OrderedClientElection(
				mockLogger.toTelemetryLogger(),
				new OrderedClientCollection(mockLogger, testDeltaManager, testQuorum),
				initialState ?? currentSequenceNumber,
				SummarizerClientElection.isClientEligible,
			),
			maxOps,
		);
		connectedState = new TestConnectedState();
		summaryManager = new SummaryManager(
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
		election.on("electedSummarizerChanged", () => {
			connectedState.clientId = election.electedParentId;
		});
		election.on("shouldSummarizeStateChanged", () => refreshSummarizerCallCount++);
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
		summarizer.removeAllListeners();
		election.removeAllListeners();
		currentSequenceNumber = 0;
	});

	describe("With initial state", () => {
		it("Should automatically elect oldest eligible client on op when undefined initial client", async () => {
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
			assertState(undefined, undefined, 432, "no elected client at first");
			defaultOp();
			assertState("a", "a", 679, "auto-elect first eligible client");
			connectedState.connect();
			await flushPromises();
			assertState("a-summarizer", "a", 679, "a's summarizer elected on connect");
			connectedState.disconnect();
			await flushPromises();
			assertState("a-summarizer", "a", 679, "summarizer still elected while completing work");
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState("a", "a", 679, "revert to parent election");
		});

		it("Should automatically elect oldest eligible client on op when not found initial client", async () => {
			currentSequenceNumber = 678;
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
					["s2", 4, false],
					["b", 7, true],
				],
				{ electedClientId: "x", electedParentId: "x", electionSequenceNumber: 432 },
			);
			assertState(undefined, undefined, 432, "no elected client at first");
			defaultOp();
			assertState("a", "a", 679, "auto-elect first eligible client");
			connectedState.connect();
			await flushPromises();
			assertState("a-summarizer", "a", 679, "a's summarizer elected on connect");
			connectedState.disconnect();
			await flushPromises();
			assertState("a-summarizer", "a", 679, "summarizer still elected while completing work");
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState("a", "a", 679, "revert to parent election");
		});

		it("Should already have elected next eligible client when ineligible initial client", () => {
			currentSequenceNumber = 678;
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
					["s2", 4, false],
					["b", 7, true],
				],
				{ electedClientId: "s2", electedParentId: "s2", electionSequenceNumber: 432 },
			);
			assertState("b", "b", 432, "auto-elect next eligible client");
		});

		it("Should remain unelected with empty quorum", () => {
			currentSequenceNumber = 678;
			createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 432,
			});
			assertState(undefined, undefined, 432, "no elected client at first");
			defaultOp();
			assertState(undefined, undefined, 432, "still no client to elect");
		});

		it("Should remain unelected with empty quorum and not found client", () => {
			currentSequenceNumber = 678;
			createElection([], {
				electedClientId: "x",
				electedParentId: "x",
				electionSequenceNumber: 432,
			});
			assertState(undefined, undefined, 432, "no client to elect");
		});

		it("Should reelect during add/remove clients", async () => {
			createElection([], {
				electedClientId: undefined,
				electedParentId: undefined,
				electionSequenceNumber: 12,
			});
			assertState(undefined, undefined, 12, "no clients, should initially be undefined");

			// Add non-interactive client, no effect
			addClient("s1", 1, false);
			assertState(undefined, undefined, 12, "only non-interactive client in quorum");

			// Add interactive client, should elect
			addClient("a", 17, true);
			assertState("a", "a", 17, "only one interactive client in quorum, should elect");
			connectedState.connect();
			await flushPromises();
			assertState("a-summarizer", "a", 17, "a's summarizer elected on connect");

			// Add more clients, no effect
			addClient("s2", 19, false);
			addClient("b", 41, true);
			assertState("a-summarizer", "a", 17, "additional younger clients should have no effect");

			// Remove elected client, should reelect
			removeClient("a", 400);
			connectedState.disconnect();
			assertState("a-summarizer", "b", 17, "summarizer still doing work");
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState("b", "b", 441, "elected client leaving should reelect next oldest client");
			connectedState.connect();
			await flushPromises();
			assertState("b-summarizer", "b", 441, "should elect new summarizer");
		});

		it("Should not reelect when client not summarizing", async () => {
			currentSequenceNumber = 4800;
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
					["s2", 4, false],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 4000 },
			);
			assertState("b", "b", 4000, "elected client based on initial state");
			connectedState.connect();
			await flushPromises();
			assertState("b-summarizer", "b", 4800, "should elect b's summarizer");

			// Should stay the same right up until max ops
			defaultOp(maxOps);
			assertState("b-summarizer", "b", 4800, "should not reelect <= max ops");

			// Should not elect another  client at this point, so the parent will stay as "b"
			defaultOp();
			assertState("b-summarizer", "b", 4800, "b's summarizer still working");
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState(
				"b-summarizer",
				"b",
				4800,
				"should not reelect a summarizer as b is still in the quorum",
			);

			// Should not trigger another reelection as the client is "unresponsive" but not out of the quorum.
			defaultOp(maxOps);
			assertState("b-summarizer", "b", 4800, "should not reelect <= max ops since baseline");
			defaultOp();
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState("b-summarizer", "b", 4800, "should not reelect again");

			// Only once the client is removed we will reelect.
			removeClient("b", 400);
			connectedState.disconnect();
			assertState("b-summarizer", "a", 4800, "summarizer still doing work");
			summarizer.runDeferred.resolve();
			await flushPromises();
			assertState(
				"a",
				"a",
				2 * maxOps + 2 + 4800 + 400,
				"elected client leaving should reelect next oldest client",
			);
		});

		it("Should not reelect even when summary ack is found", () => {
			currentSequenceNumber = 4800;
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
					["s2", 4, false],
					["b", 7, true],
				],
				{ electedClientId: "s2", electedParentId: "s2", electionSequenceNumber: 4000 },
			);
			assertState("b", "b", 4000, "elected based on initial state");

			// Should stay the same right up until max ops
			defaultOp(maxOps - 800);
			assertState("b", "b", 4000, "should not reelect <= max ops");

			// Summary ack should only increment election seq #
			summaryAck();
			assertState("b", "b", maxOps + 4001, "should not reelect after summary ack");

			// Summary ack should prevent reelection.
			defaultOp(maxOps);
			assertState("b", "b", maxOps + 4001, "should not reelect <= max ops since summary ack");

			// Should not elect next client at this point as client election is disabled.
			defaultOp();
			assertState(
				"b",
				"b",
				maxOps + 4001,
				"should not reelect even when > max ops since summary ack",
			);
		});

		it("Should never reelect when disabled", () => {
			currentSequenceNumber = 4800;
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
					["s2", 4, false],
					["b", 7, true],
				],
				{ electedClientId: "b", electedParentId: "b", electionSequenceNumber: 4000 },
			);
			assertState("b", "b", 4000, "elected client based on initial state");

			// Should stay the same right up until max ops
			defaultOp(maxOps - 800);
			assertState("b", "b", 4000, "should not reelect <= max ops");

			// Should elect first client at this point if enabled
			defaultOp();
			assertState("b", "b", 4000, "would reelect > max ops, but not since disabled");

			// Trigger another reelection if it were to be enabled
			defaultOp(maxOps);
			assertState("b", "b", 4000, "should not reelect <= max ops since baseline");
			defaultOp();
			assertState("b", "b", 4000, "would reelect again, but not since disabled");
		});
	});

	describe("No initial state", () => {
		it("Should reelect during add/remove clients", () => {
			createElection();
			assertState(undefined, undefined, 0, "no clients, should initially be undefined");

			// Add non-interactive client, no effect
			addClient("s1", 1, false);
			assertState(undefined, undefined, 0, "only non-interactive client in quorum");

			// Add interactive client, should elect
			addClient("a", 2, true);
			assertState("a", "a", 2, "only one interactive client in quorum, should elect");

			// Add more clients, no effect
			addClient("s2", 3, false);
			addClient("b", 4, true);
			assertState("a", "a", 2, "additional younger clients should have no effect");

			// Remove elected client, should reelect
			removeClient("a", 4);
			assertState("b", "b", 8, "elected client leaving should reelect next oldest client");
		});

		it("Should not reelect when client not summarizing", () => {
			createElection([
				["s1", 1, false],
				["a", 2, true],
				["s2", 4, false],
				["b", 7, true],
			]);
			assertState("a", "a", 7, "initially should be oldest interactive client");

			// Should stay the same right up until max ops
			defaultOp(maxOps);
			assertState("a", "a", 7, "should not reelect <= max ops");

			// Should not elect next client when reelect > max ops.
			defaultOp();
			assertState("a", "a", 7, "should not reelect > max ops");

			// Next election should be undefined, which resets to first client
			defaultOp(maxOps);
			assertState("a", "a", 7, "should not reelect <= max ops since baseline");
			defaultOp();
			assertState(
				"a",
				"a",
				7,
				"should not reelect back to oldest client as election is disabled.",
			);
		});

		it("Should not reelect when summary ack is found", () => {
			createElection([
				["s1", 1, false],
				["a", 2, true],
				["s2", 4, false],
				["b", 7, true],
			]);
			assertState("a", "a", 7, "initially should elect oldest interactive client");

			// Should stay the same right up until max ops
			defaultOp(maxOps);
			assertState("a", "a", 7, "should not reelect <= max ops");

			// Summary ack should only increment election seq #
			summaryAck();
			assertState("a", "a", maxOps + 8, "should not reelect after summary ack");

			// Summary ack should prevent reelection
			defaultOp(maxOps);
			assertState("a", "a", maxOps + 8, "should not reelect <= max ops since summary ack");

			// Should not elect next client at this point
			defaultOp();
			assertState("a", "a", maxOps + 8, "should not reelect > max ops since summary ack");
		});

		it("Should never reelect when disabled", () => {
			createElection(
				[
					["s1", 1, false],
					["a", 2, true],
					["s2", 4, false],
					["b", 7, true],
				],
				undefined,
			);
			assertState("a", "a", 7, "initially should be oldest interactive client");

			// Should stay the same right up until max ops
			defaultOp(maxOps);
			assertState("a", "a", 7, "should not reelect <= max ops");

			// Should elect next client at this point
			defaultOp();
			assertState("a", "a", 7, "would reelect > max ops, but not since disabled");

			// Next election should be undefined, which resets to first client
			defaultOp(maxOps);
			assertState("a", "a", 7, "should not reelect <= max ops since baseline");
			defaultOp();
			assertState("a", "a", 7, "would reelect back to oldest client, but not since disabled");
		});
	});
});
