/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	IDeltaManager,
	IDeltaManagerEvents,
} from "@fluidframework/container-definitions/internal";
import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { ConnectionMode, IClient, ISequencedClient } from "@fluidframework/driver-definitions";
import {
	IClientConfiguration,
	ITokenClaims,
} from "@fluidframework/driver-definitions/internal";
import {
	TelemetryEventCategory,
	createChildLogger,
	loggerToMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import { Audience } from "../audience.js";
import { ConnectionState } from "../connectionState.js";
import {
	IConnectionStateHandler,
	IConnectionStateHandlerInputs,
	createConnectionStateHandlerCore,
} from "../connectionStateHandler.js";
import { IConnectionDetailsInternal } from "../contracts.js";
import { ProtocolHandler } from "../protocol.js";

class MockDeltaManagerForCatchingUp
	extends TypedEventEmitter<IDeltaManagerEvents>
	implements Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber" | "lastKnownSeqNumber">
{
	lastSequenceNumber: number = 5;
	lastKnownSeqNumber: number = 10;
	catchUp(seq = 10): void {
		this.lastKnownSeqNumber = seq;
		this.lastSequenceNumber = seq;
		this.emit("op", { sequenceNumber: this.lastKnownSeqNumber });
	}
}

describe("ConnectionStateHandler Tests", () => {
	let clock: SinonFakeTimers;
	let handlerInputs: IConnectionStateHandlerInputs;
	let connectionStateHandler: IConnectionStateHandler;
	let protocolHandler: ProtocolHandler;
	let shouldClientJoinWrite: boolean;
	let connectionDetails: IConnectionDetailsInternal;
	let connectionDetails2: IConnectionDetailsInternal;
	let connectionDetails3: IConnectionDetailsInternal;
	const expectedTimeout = 90000;
	const pendingClientId = "pendingClientId";
	const pendingClientId2 = "pendingClientId2";
	const pendingClientId3 = "pendingClientId3";
	let deltaManagerForCatchingUp: MockDeltaManagerForCatchingUp;
	let connectionStateHandler_receivedAddMemberEvent: (id: string) => void;
	let connectionStateHandler_receivedJoinSignalEvent: (
		details: IConnectionDetailsInternal,
	) => void;
	let connectionStateHandler_receivedRemoveMemberEvent: (id: string) => void;
	let connectionStateHandler_receivedLeaveSignalEvent: (id: string) => void;

	// Stash the real setTimeout because sinon fake timers will hijack it.
	const realSetTimeout = setTimeout;

	// function to yield control in the Javascript event loop.
	async function yieldEventLoop(): Promise<void> {
		await new Promise<void>((resolve) => {
			realSetTimeout(resolve, 0);
		});
	}

	async function tickClock(tickValue: number): Promise<void> {
		clock.tick(tickValue);

		// Yield the event loop because the outbound op will be processed asynchronously.
		await yieldEventLoop();
	}

	function createHandler(
		connectedRaisedWhenCaughtUp: boolean,
		readClientsWaitForJoinSignal: boolean,
	): IConnectionStateHandler {
		const handler = createConnectionStateHandlerCore(
			connectedRaisedWhenCaughtUp,
			readClientsWaitForJoinSignal,
			handlerInputs,
			deltaManagerForCatchingUp as unknown as IDeltaManager<unknown, unknown>,
			undefined,
		);
		handler.initProtocol(protocolHandler);
		return handler;
	}

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		connectionDetails = {
			clientId: pendingClientId,
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			claims: {} as ITokenClaims,
			mode: "read",
			version: "0.1",
			initialClients: [],
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			serviceConfiguration: {} as IClientConfiguration,
			checkpointSequenceNumber: undefined,
			reason: { text: "test" },
		};
		connectionDetails2 = {
			clientId: pendingClientId2,
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			claims: {} as ITokenClaims,
			mode: "write",
			version: "0.1",
			initialClients: [],
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			serviceConfiguration: {} as IClientConfiguration,
			checkpointSequenceNumber: undefined,
			reason: { text: "test" },
		};
		connectionDetails3 = {
			clientId: pendingClientId3,
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			claims: {} as ITokenClaims,
			mode: "write",
			version: "0.1",
			initialClients: [],
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			serviceConfiguration: {} as IClientConfiguration,
			checkpointSequenceNumber: undefined,
			reason: { text: "test" },
		};

		protocolHandler = new ProtocolHandler(
			{ minimumSequenceNumber: 0, sequenceNumber: 0 }, // attributes
			{ members: [], proposals: [], values: [] }, // quorumSnapshot
			(key, value) => 0, // sendProposal
			new Audience(),
			(clientId: string) => false, // shouldClientHaveLeft
		);
		shouldClientJoinWrite = false;
		const logger = createChildLogger();
		handlerInputs = {
			maxClientLeaveWaitTime: expectedTimeout,
			shouldClientJoinWrite: (): boolean => shouldClientJoinWrite,
			logConnectionIssue: (
				eventName: string,
				category: TelemetryEventCategory,
				details?: ITelemetryBaseProperties,
			): void => {
				throw new Error(`logConnectionIssue: ${eventName} ${JSON.stringify(details)}`);
			},
			connectionStateChanged: (): void => {},
			logger,
			mc: loggerToMonitoringContext(logger),
			clientShouldHaveLeft: (clientId: string): void => {},
			onCriticalError: (error): void => {
				throw error;
			},
		};

		deltaManagerForCatchingUp = new MockDeltaManagerForCatchingUp();

		connectionStateHandler = createHandler(
			false, // connectedRaisedWhenCaughtUp,
			false,
		); // readClientsWaitForJoinSignal

		connectionStateHandler_receivedAddMemberEvent = (id: string): void => {
			protocolHandler.quorum.addMember(id, { client: {} } as unknown as ISequencedClient);
		};
		connectionStateHandler_receivedRemoveMemberEvent = (id: string): void => {
			protocolHandler.quorum.removeMember(id);
		};
		connectionStateHandler_receivedJoinSignalEvent = (
			details: IConnectionDetailsInternal,
		): void => {
			protocolHandler.audience.addMember(details.clientId, {
				mode: details.mode,
			} as unknown as IClient);
		};
		connectionStateHandler_receivedLeaveSignalEvent = (id: string): void => {
			protocolHandler.audience.removeMember(id);
		};
	});

	afterEach(() => {
		// Get rid of timers
		connectionStateHandler.receivedDisconnectEvent({ text: "the end of test" });
		connectionStateHandler.dispose();
	});

	it("Should move to connected state on normal flow for read client", async () => {
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Read Client should be in connected state",
		);
	});

	it("Should move to connected after catching up for read client #1", async () => {
		connectionStateHandler = createHandler(
			true, // connectedRaisedWhenCaughtUp
			false,
		); // readClientsWaitForJoinSignal

		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in Disconnected state",
		);
		connectionStateHandler.establishingConnection({ text: "read" });
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		deltaManagerForCatchingUp.catchUp();
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Read Client should be in Connected state",
		);
	});

	it("Should move to connected after catching up for read client #2", async () => {
		connectionStateHandler = createHandler(
			true, // connectedRaisedWhenCaughtUp
			true,
		); // readClientsWaitForJoinSignal
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in Disconnected state",
		);

		connectionStateHandler.establishingConnection({ text: "read" });
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		deltaManagerForCatchingUp.catchUp();
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		connectionStateHandler_receivedJoinSignalEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Read Client should be in Connected state",
		);
	});

	it("Should move to connected after catching up for read client #3", async () => {
		connectionStateHandler = createHandler(
			true, // connectedRaisedWhenCaughtUp
			true,
		); // readClientsWaitForJoinSignal
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in Disconnected state",
		);

		connectionStateHandler.establishingConnection({ text: "read" });
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		connectionStateHandler_receivedJoinSignalEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		deltaManagerForCatchingUp.catchUp();
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Read Client should be in Connected state",
		);
	});

	it("Should move to connected after receiving join op for read client", async () => {
		connectionStateHandler = createHandler(
			false, // connectedRaisedWhenCaughtUp
			true,
		); // readClientsWaitForJoinSignal
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in Disconnected state",
		);

		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Read Client should be in Connected state",
		);
	});

	it("Changes in lastKnownSeqNumber by join signal should be picked up", async () => {
		connectionStateHandler = createHandler(
			true, // connectedRaisedWhenCaughtUp
			true,
		); // readClientsWaitForJoinSignal

		connectionStateHandler.establishingConnection({ text: "write" });
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		const lastKnown = deltaManagerForCatchingUp.lastKnownSeqNumber;
		const signalRef = lastKnown + 10;

		deltaManagerForCatchingUp.catchUp(lastKnown);
		deltaManagerForCatchingUp.lastKnownSeqNumber = signalRef;
		connectionStateHandler_receivedJoinSignalEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);

		deltaManagerForCatchingUp.catchUp(signalRef);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Read Client should be in Connected state",
		);
	});

	it("Should move to connected state on normal flow for write client", async () => {
		connectionDetails.mode = "write";
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in connecting state",
		);
		connectionStateHandler_receivedAddMemberEvent("anotherClientId");
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Some other client joined.",
		);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);
	});

	it("Should move to connected state after catching up for write client", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler = createHandler(
			true, // connectedRaisedWhenCaughtUp
			false,
		); // readClientsWaitForJoinSignal

		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in Disconnected state",
		);

		connectionStateHandler.establishingConnection({ text: "write" });
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state",
		);
		connectionStateHandler_receivedAddMemberEvent("anotherClientId");
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Some other client joined.",
		);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in CatchingUp state until caught up",
		);
		deltaManagerForCatchingUp.catchUp();
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in Connected state",
		);
	});

	it("Connect write first, init protocol later #1", async () => {
		// ConnectionStateManager without initialized protocol
		connectionStateHandler = createConnectionStateHandlerCore(
			false, // connectedRaisedWhenCaughtUp,
			false, // readClientsWaitForJoinSignal
			handlerInputs,
			deltaManagerForCatchingUp as unknown as IDeltaManager<unknown, unknown>,
			undefined,
		);

		connectionDetails.mode = "write";
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in connecting state",
		);

		// init protocol
		connectionStateHandler.initProtocol(protocolHandler);

		connectionStateHandler_receivedAddMemberEvent(pendingClientId);

		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);
	});

	it("Connect write first, init protocol later #2", async () => {
		// ConnectionStateManager without initialized protocol
		connectionStateHandler = createConnectionStateHandlerCore(
			false, // connectedRaisedWhenCaughtUp,
			false, // readClientsWaitForJoinSignal
			handlerInputs,
			deltaManagerForCatchingUp as unknown as IDeltaManager<unknown, unknown>,
			undefined,
		);

		connectionDetails.mode = "write";
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client should be in connecting state",
		);

		/*
        There is a tiny tiny race possible, where these events happen in this order:
          1. A connection is established (no "cached" mode is used, so it happens in parallel / faster than other steps)
          2. Some other client produces a summary
          3. We get "lucky" and load from that summary as our initial snapshot
          4. ConnectionStateHandler.initProtocol is called, "self" is already in the quorum.
        We could avoid this sequence (and delete this test case and handling in initProtocol()) if
          we move connection lower in Container.load().
        */
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);

		// init protocol
		connectionStateHandler.initProtocol(protocolHandler);

		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);
	});

	it("Should wait for previous client to leave before moving to connected state", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);

		shouldClientJoinWrite = true;
		// Disconnect the client
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);

		// Make new client join so that it waits for previous client to leave
		connectionStateHandler.receivedConnectEvent(connectionDetails2);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should be in connecting state as we are waiting for leave",
		);

		// Send leave
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 2 should be in connected state",
		);
	});

	it("Should wait for previous client to leave before moving to connected state, even if already in quorum", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);

		shouldClientJoinWrite = true;
		// Disconnect the client
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);

		// Make new client join so that it waits for previous client to leave
		// Put Client 2 in quorum before receiving connect event
		connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
		connectionStateHandler.receivedConnectEvent(connectionDetails2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should be in connecting state as we are waiting for leave",
		);

		// Send leave
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 2 should be in connected state",
		);
	});

	it("read connection following write connection won't have leave timer", async () => {
		// Connect a write client, to be Disconnected
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);

		// Disconnect the first client, indicating all pending ops were ack'd
		shouldClientJoinWrite = false;
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);

		// Make new client join as read - no waiting for leave since shouldClientJoinWrite is false
		connectionDetails3.mode = "read";
		connectionStateHandler.receivedConnectEvent(connectionDetails3);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 2 should be in connected state",
		);
	});

	it("Should wait for timeout before moving to connected state if no leave received", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);

		shouldClientJoinWrite = true;
		// Disconnect the client
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);

		// Make new client join so that it waits for previous client to leave
		connectionStateHandler.receivedConnectEvent(connectionDetails2);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should be in connecting state as we are waiting for timeout",
		);

		// Check state before timeout
		await tickClock(expectedTimeout - 1);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should still be in connecting state as we are waiting for timeout",
		);

		await tickClock(1);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 2 should now be in connected state",
		);
	});

	it("Should wait for Saved event before moving to connected state if no leave received", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client should be in connected state",
		);

		shouldClientJoinWrite = true;
		// Disconnect the client
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client should be in disconnected state",
		);

		// Make new client join so that it waits for previous client to leave
		connectionStateHandler.receivedConnectEvent(connectionDetails2);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should be in connecting state as we are waiting for timeout",
		);

		// Check state before timeout
		await tickClock(expectedTimeout - 1);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should still be in connecting state as we are waiting for timeout",
		);

		// Fire the container saved event.
		connectionStateHandler.containerSaved();
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 2 should now be in connected state",
		);
	});

	it("All pending state should be cleared after disconnect", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		assert(
			connectionStateHandler.pendingClientId !== undefined,
			"pendingClientId should be set after receiving 'connect' event",
		);

		connectionStateHandler.receivedDisconnectEvent({ text: "test" });
		assert(
			connectionStateHandler.pendingClientId === undefined,
			"pendingClientId should not be set after receiving 'disconnect' event",
		);
	});

	async function testComplex(client3mode: ConnectionMode): Promise<void> {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 1 should be in connected state",
		);

		shouldClientJoinWrite = true;
		// Disconnect the client
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client 1 should be in disconnected state",
		);

		// Make new client join but disconnect it from connecting state
		connectionStateHandler.receivedConnectEvent(connectionDetails2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should be in connecting state",
		);
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client 2 should be in disconnected state",
		);

		// Make new client 3 join so that it waits for client 1 to leave
		// This is rather tricky case when client3mode === "read", as we are testing adding "read" client when
		// shouldClientJoinWrite() reports true.
		connectionDetails3.mode = client3mode;
		connectionStateHandler.receivedConnectEvent(connectionDetails3);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

		// Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
		// on client 1 leave
		connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 3 should still be in connecting state",
		);

		// Client 1 leaves.
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 3 should move to connected state",
		);
		// Timeout should not raise any error as timer should be cleared
		await tickClock(expectedTimeout);
	}

	it("Should wait for client 1 to leave before moving to connected state(Client 3) when client 2 got disconnected from connecting state #1", async () => {
		return testComplex("read");
	});

	it("Should wait for client 1 to leave before moving to connected state(Client 3) when client 2 got disconnected from connecting state #2", async () => {
		return testComplex("write");
	});

	it("Should wait for client 1 timeout before moving to connected state(Client 3) when client 2 got disconnected from connecting state #3", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 1 should be in connected state",
		);

		shouldClientJoinWrite = true;
		// Disconnect the client
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client 1 should be in disconnected state",
		);

		// Make new client join but disconnect it from connecting state
		connectionStateHandler.receivedConnectEvent(connectionDetails2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should be in connecting state",
		);
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client 2 should be in disconnected state",
		);

		// Make new client 3 join so that it waits for client 1 to leave
		connectionStateHandler.receivedConnectEvent(connectionDetails3);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

		// Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
		// on client 1 leave.
		connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 3 should still be in connecting state",
		);

		// Pass some time.
		await tickClock(expectedTimeout - 1);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 3 should still be in connecting state as timeout has not occured",
		);

		await tickClock(1);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 3 should move to connected state",
		);
		// Sending client 1 leave now should not cause any error
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 3 should move to connected state",
		);
	});

	it("Should wait for savedEvent before moving to connected state(Client 3) when client 2 got disconnected from connecting state", async () => {
		connectionDetails.mode = "write";
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 1 should be in connected state",
		);

		shouldClientJoinWrite = true;
		// Disconnect the client
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client 1 should be in disconnected state",
		);

		// Make new client join but disconnect it from connecting state
		connectionStateHandler.receivedConnectEvent(connectionDetails2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 2 should be in connecting state",
		);
		connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Disconnected,
			"Client 2 should be in disconnected state",
		);

		// Make new client 3 join so that it waits for client 1 to leave
		connectionStateHandler.receivedConnectEvent(connectionDetails3);
		connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

		// Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
		// on client 1 leave.
		connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 3 should still be in connecting state",
		);

		// Pass some time.
		await tickClock(expectedTimeout - 1);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.CatchingUp,
			"Client 3 should still be in connecting state as timeout has not occured",
		);

		connectionStateHandler.containerSaved();
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 3 should move to connected state",
		);
		// Sending client 1 leave now should not cause any error
		connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 3 should move to connected state",
		);
	});

	// biome-ignore format: https://github.com/biomejs/biome/issues/4202
	it(
		"Should wait for client 1 to leave before moving to connected state(Client 3) when client 2 " +
			"got disconnected from connected state",
		async () => {
			connectionDetails.mode = "write";
			connectionStateHandler.receivedConnectEvent(connectionDetails);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 1 should be in connected state",
			);

			shouldClientJoinWrite = true;
			// Disconnect the client
			connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Disconnected,
				"Client 1 should be in disconnected state",
			);

			// Make new client join but disconnect it from connected state
			connectionStateHandler.receivedConnectEvent(connectionDetails2);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 2 should still be in connecting state",
			);
			connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Disconnected,
				"Client 2 should be in disconnected state",
			);

			// Make new client 3 join so that it waits for client 1 to leave
			connectionStateHandler.receivedConnectEvent(connectionDetails3);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId3);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 3 should still be in connecting state",
			);

			// Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
			// on client 1 leave
			connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 3 should still be in connecting state",
			);

			// Client 1 leaves.
			connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 3 should move to connected state",
			);
			// Timeout should not raise any error as timer should be cleared
			await tickClock(expectedTimeout);
		},
	);

	// biome-ignore format: https://github.com/biomejs/biome/issues/4202
	it(
		"Should wait for client 1 timeout before moving to connected state(Client 3) when client 2 " +
			"got disconnected from connected state",
		async () => {
			connectionDetails.mode = "write";
			connectionStateHandler.receivedConnectEvent(connectionDetails);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 1 should be in connected state",
			);

			shouldClientJoinWrite = true;
			// Disconnect the client
			connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Disconnected,
				"Client 1 should be in disconnected state",
			);

			// Make new client join but disconnect it from connecting state
			connectionStateHandler.receivedConnectEvent(connectionDetails2);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 2 should still be in connecting state",
			);
			connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Disconnected,
				"Client 2 should be in disconnected state",
			);

			// Make new client 3 join so that it waits for client 1 to leave
			connectionStateHandler.receivedConnectEvent(connectionDetails3);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

			// Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
			// on client 1 leave.
			connectionStateHandler_receivedRemoveMemberEvent("pendingClientId2");
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 3 should still be in connecting state",
			);

			// Pass some time.
			await tickClock(expectedTimeout - 1);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 3 should still be in connecting state as timeout has not occured",
			);

			await tickClock(1);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 3 should move to connected state",
			);

			// Sending client 1 leave now should not cause any error
			connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 3 should move to connected state",
			);
		},
	);

	// biome-ignore format: https://github.com/biomejs/biome/issues/4202
	it(
		"Client 3 should wait for client 2(which got disconnected without sending any ops) to leave " +
			"when client 2 already waited on client 1",
		async () => {
			connectionDetails.mode = "write";
			connectionStateHandler.receivedConnectEvent(connectionDetails);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 1 should be in connected state",
			);

			shouldClientJoinWrite = true;
			// Disconnect the client
			connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Disconnected,
				"Client 1 should be in disconnected state",
			);

			// Make new client join but disconnect it from connected state
			connectionStateHandler.receivedConnectEvent(connectionDetails2);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 2 should still be in connecting state",
			);
			// Client 1 leaves.
			connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);

			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 2 should move to connected state",
			);

			// Client 2 leaves without sending any ops.
			connectionStateHandler.receivedDisconnectEvent({ text: "Test" });
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Disconnected,
				"Client 2 should be in disconnected state",
			);

			// Make new client 3 join. Now it should not wait for previous client as client 2 already waited.
			connectionStateHandler.receivedConnectEvent(connectionDetails3);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 3 should still be in connecting state",
			);
			connectionStateHandler_receivedAddMemberEvent(pendingClientId3);
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.CatchingUp,
				"Client 3 should still be in connecting state",
			);

			// Client 2 leaves.
			connectionStateHandler_receivedRemoveMemberEvent("pendingClientId2");
			assert.strictEqual(
				connectionStateHandler.connectionState,
				ConnectionState.Connected,
				"Client 3 should move to connected state",
			);
			// Timeout should not raise any error as timer should be cleared
			await tickClock(expectedTimeout);
		},
	);

	// biome-ignore format: https://github.com/biomejs/biome/issues/4202
	it("test 'read' reconnect & races ", async () => {
		connectionStateHandler = createHandler(
			false, // connectedRaisedWhenCaughtUp,
			true, // readClientsWaitForJoinSignal
		);

		// Typical flow to reach connected state ("read" connection)
		connectionStateHandler.establishingConnection({ text: "initial connect" });
		connectionStateHandler.receivedConnectEvent(connectionDetails);
		connectionStateHandler_receivedJoinSignalEvent(connectionDetails);
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 1 should be in connected state",
		);

		connectionStateHandler.receivedDisconnectEvent({ text: "disconnect" });

		// Another read client is joining, but we don't yet receive its join signal (so not yet in connected state)
		connectionDetails2.mode = "read";
		connectionStateHandler.establishingConnection({ text: "initial connect" });
		connectionStateHandler.receivedConnectEvent(connectionDetails2);

		// Simulate how ConnectionStateHandler observes reconnection flow.
		// It will see Audience being fully cleared, and then repopulated with new state
		connectionStateHandler_receivedLeaveSignalEvent(connectionDetails.clientId);

		// We connected to different front-end, it may not processed yet leave signal for first connection,
		// and thus it appears in the Audience again.
		connectionStateHandler_receivedJoinSignalEvent(connectionDetails);
		connectionStateHandler_receivedJoinSignalEvent(connectionDetails2);

		// It should not wait for leave of connectionDetails.clientId
		assert.strictEqual(
			connectionStateHandler.connectionState,
			ConnectionState.Connected,
			"Client 2 should be in connected state",
		);

		// This should  not cause any trouble.
		connectionStateHandler_receivedLeaveSignalEvent(connectionDetails.clientId);

		// Timeout should not raise any error as timer should be cleared
		await tickClock(expectedTimeout);
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});
});
