/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { ISummarizerEvents } from "@fluidframework/container-runtime-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import type { ISequencedClient } from "@fluidframework/driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import sinon from "sinon";
import {
	type IConnectedEvents,
	type ISummarizer,
	type ISummaryCollectionOpEvents,
	SummarizerClientElection,
	SummaryManager,
	SummaryManagerState,
	summarizerClientType,
} from "../../summary/index.js";
import { TestQuorumClients } from "./testQuorumClients.js";

describe("Quorum summarizer creation integration", () => {
	let clock: sinon.SinonFakeTimers;
	const managers: SummaryManager[] = [];
	beforeEach(() => {
		clock = sinon.useFakeTimers();
	});
	afterEach(() => {
		for (const manager of managers.splice(0)) {
			manager.dispose();
		}
		clock.restore();
	});

	class Connection extends TypedEventEmitter<IConnectedEvents> {
		public connected = true;
		constructor(public clientId: string) {
			super();
		}
		public disconnect(): void {
			this.connected = false;
			this.emit("disconnected");
		}
	}
	class Child extends TypedEventEmitter<ISummarizerEvents> implements ISummarizer {
		public readonly finished = new Deferred<void>();
		public readonly stop = sinon.stub();
		public readonly close = sinon.stub();
		public readonly summarizeOnDemand = sinon.stub();
		public readonly enqueueSummarize = sinon.stub();
		public readonly run = sinon.stub().callsFake(async () => {
			await this.finished.promise;
			return "summarizerClientDisconnected" as const;
		});
	}
	function setup() {
		const quorum = new TestQuorumClients();
		const summaries = new TypedEventEmitter<ISummaryCollectionOpEvents>();
		const logger = new MockLogger();
		let sequenceNumber = 0;
		const delta = {
			get lastSequenceNumber() {
				return sequenceNumber;
			},
		};
		function add(id: string, summarizer = false): void {
			const client: ISequencedClient = {
				sequenceNumber: ++sequenceNumber,
				client: {
					mode: "write",
					permission: [],
					scopes: [],
					user: { id },
					details: {
						capabilities: { interactive: !summarizer },
						type: summarizer ? summarizerClientType : undefined,
					},
				},
			};
			quorum.addClient(id, client);
		}
		function remove(id: string): void {
			sequenceNumber++;
			quorum.removeClient(id);
		}
		function election() {
			return new SummarizerClientElection(
				logger,
				delta,
				quorum,
				summaries,
				1000,
				sequenceNumber,
			);
		}
		function parent(id: string, delay = 0, initialDelay = 0) {
			const connection = new Connection(id);
			const observer = election();
			const requests: { child: Child; loaded: Deferred<ISummarizer> }[] = [];
			const manager = new SummaryManager(
				observer,
				connection,
				{ opsSinceLastAck: 5000, addOpListener: () => {}, removeOpListener: () => {} },
				logger,
				async () => {
					const request = { child: new Child(), loaded: new Deferred<ISummarizer>() };
					requests.push(request);
					return request.loaded.promise;
				},
				{
					getDelay: () => delay,
					maxDelayMs: delay,
					delayWindowMs: 0,
					numAttempts: 0,
					delayFn: () => delay,
				},
				{
					initialDelayMs: initialDelay,
					opsToBypassInitialDelay: initialDelay > 0 ? 10000 : 0,
				},
			);
			managers.push(manager);
			manager.start();
			return { manager, connection, observer, requests };
		}
		return { add, remove, parent, election };
	}

	for (const first of ["s1", "s2"]) {
		it(`waits for the last sequenced child departure during handoff (${first} leaves first)`, async () => {
			const test = setup();
			test.add("a");
			test.add("b");
			const a = test.parent("a");
			const b = test.parent("b");
			await clock.tickAsync(0);
			const request = a.requests[0];
			assert(request !== undefined);
			test.add("s1", true);
			request.loaded.resolve(request.child);
			await clock.tickAsync(0);
			assert.equal(request.child.run.callCount, 1);
			test.add("s2", true);
			const restored = test.election();
			test.remove("a");
			assert.equal(request.child.stop.callCount, 1);
			request.child.finished.resolve();
			await clock.tickAsync(0);
			assert.equal(b.requests.length, 0, "local completion does not authorize creation");
			test.remove(first);
			await clock.tickAsync(0);
			assert.equal(b.requests.length, 0, "idle remaining child blocks replacement");
			assert.equal(restored.summarizerExistsInQuorum, b.observer.summarizerExistsInQuorum);
			test.remove(first === "s1" ? "s2" : "s1");
			await clock.tickAsync(0);
			assert.equal(b.requests.length, 1);
			assert.equal(restored.summarizerExistsInQuorum, false);
		});
	}

	it("runs the last-summary path after own-child join, disconnect and late load completion", async () => {
		const test = setup();
		test.add("a");
		const a = test.parent("a");
		await clock.tickAsync(0);
		const request = a.requests[0];
		assert(request !== undefined);
		test.add("s", true);
		a.connection.disconnect();
		request.loaded.resolve(request.child);
		await clock.tickAsync(0);
		assert.equal(request.child.run.callCount, 1);
		assert.equal(request.child.stop.firstCall.args[0], "parentNotConnected");
		assert.equal(a.manager.currentState, SummaryManagerState.Stopping);
		request.child.finished.resolve();
		await clock.tickAsync(0);
		assert.equal(a.requests.length, 1);
	});

	it("closes an in-flight child without running it after parent responsibility changes", async () => {
		const test = setup();
		test.add("a");
		test.add("b");
		const a = test.parent("a");
		const b = test.parent("b");
		await clock.tickAsync(0);
		const request = a.requests[0];
		assert(request !== undefined);
		test.add("s", true);
		test.remove("a");
		request.loaded.resolve(request.child);
		await clock.tickAsync(0);
		assert.equal(request.child.run.callCount, 0);
		assert.equal(request.child.close.callCount, 1);
		assert.equal(b.requests.length, 0);
		test.remove("s");
		await clock.tickAsync(0);
		assert.equal(b.requests.length, 1);
	});

	it("keeps the original stop intent when a disconnected parent reconnects during creation", async () => {
		const test = setup();
		test.add("a");
		const a = test.parent("a");
		await clock.tickAsync(0);
		const request = a.requests[0];
		assert(request !== undefined);
		test.add("s", true);
		a.connection.disconnect();
		a.connection.connected = true;
		a.connection.emit("connected", "a");
		request.loaded.resolve(request.child);
		await clock.tickAsync(0);
		assert.equal(request.child.stop.firstCall.args[0], "parentNotConnected");
		assert.equal(request.child.run.callCount, 1);
		request.child.finished.resolve();
		await clock.tickAsync(0);
		assert.equal(a.requests.length, 1, "own child still in quorum blocks another request");
		test.remove("s");
		await clock.tickAsync(0);
		assert.equal(a.requests.length, 2);
	});

	it("does not issue a new creation after losing election during throttling", async () => {
		const test = setup();
		test.add("a");
		test.add("b");
		const a = test.parent("a", 100);
		test.remove("a");
		await clock.tickAsync(100);
		assert.equal(a.requests.length, 0);
	});

	it("permits high-op disconnected-parent recovery before creation", async () => {
		const test = setup();
		test.add("a");
		const a = test.parent("a", 100);
		a.connection.disconnect();
		await clock.tickAsync(100);
		assert.equal(a.requests.length, 1);
	});

	it("skips low-op creation when disconnected during the initial delay", async () => {
		const test = setup();
		test.add("a");
		const a = test.parent("a", 0, 100);
		a.connection.disconnect();
		await clock.tickAsync(100);
		assert.equal(a.requests.length, 0);
	});

	it("waits for sequenced departure after forced local cleanup", async () => {
		const test = setup();
		test.add("a");
		test.add("b");
		const a = test.parent("a");
		const b = test.parent("b");
		await clock.tickAsync(0);
		const request = a.requests[0];
		assert(request !== undefined);
		test.add("s", true);
		request.loaded.resolve(request.child);
		await clock.tickAsync(0);
		test.remove("a");
		await clock.tickAsync(120000);
		assert.equal(request.child.close.callCount, 1);
		assert.equal(b.requests.length, 0);
		test.remove("s");
		await clock.tickAsync(0);
		assert.equal(b.requests.length, 1);
		request.child.finished.resolve();
		await clock.tickAsync(0);
	});
});
