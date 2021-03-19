/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { IClient, IClientConfiguration, ITokenClaims } from "@fluidframework/protocol-definitions";
import { IConnectionDetails } from "@fluidframework/container-definitions";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { ConnectionState } from "../container";
import { ConnectionStateHandler } from "../connectionStateHandler";

describe("ConnectionStateHandler Tests", () => {
    let clock: SinonFakeTimers;
    let connectionStateHandler: ConnectionStateHandler;
    let protocolHandler: ProtocolOpHandler;
    let shouldClientJoinWrite: boolean;
    let connectionDetails: IConnectionDetails;
    let client: IClient;
    const expectedTimeout = 90000;
    const pendingClientId = "pendingClientId";

    // Stash the real setTimeout because sinon fake timers will hijack it.
    const realSetTimeout = setTimeout;

    // function to yield control in the Javascript event loop.
    async function yieldEventLoop(): Promise<void> {
        await new Promise<void>((resolve) => {
            realSetTimeout(resolve, 0);
        });
    }

    async function tickClock(tickValue: number) {
        clock.tick(tickValue);

        // Yield the event loop because the outbound op will be processed asynchronously.
        await yieldEventLoop();
    }

    before(() => {
        clock = useFakeTimers();
    });

    beforeEach(() => {
        protocolHandler = new ProtocolOpHandler(0, 0, 1, [], [], [], (key, value) => 0, (seqNum) => undefined);
        connectionDetails = {
            clientId: pendingClientId,
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            claims: {} as ITokenClaims,
            existing: true,
            mode: "read",
            version: "0.1",
            initialClients: [],
            maxMessageSize: 1000,
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            serviceConfiguration: {} as IClientConfiguration,
            checkpointSequenceNumber: undefined,
        };
        client = {
            mode: "read",
            user: {
                id: "userId",
            },
            permission: [],
            details: {
                capabilities: { interactive: true },
            },
            scopes: [],
        };
        connectionStateHandler = new ConnectionStateHandler(
            {
                logConnectionStateChangeTelemetry: () => undefined,
                propagateConnectionState:() => undefined,
                isContainerLoaded: () => true,
                maxClientLeaveWaitTime: expectedTimeout,
                protocolHandler: () => protocolHandler,
                shouldClientJoinWrite: () => shouldClientJoinWrite,
                client: () => client,
            },
            new TelemetryNullLogger(),
        );
    });

    it("Should move to connected state on normal flow for read client", async () => {
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");
        connectionStateHandler.receivedConnectEvent(new EventEmitter(), client.mode, connectionDetails, 0);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Read Client should be in connected state");
    });

    it("Should move to connected state on normal flow for write client", async () => {
        client.mode = "write";
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");
        connectionStateHandler.receivedConnectEvent(new EventEmitter(), client.mode, connectionDetails, 0);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client should be in connecting state");
        connectionStateHandler.receivedAddMemberEvent("anotherClientId", protocolHandler.quorum);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Some other client joined.");
        connectionStateHandler.receivedAddMemberEvent(pendingClientId, protocolHandler.quorum);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");
    });

    it("Should wait for previous client to leave before moving to conencted state", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(new EventEmitter(), client.mode, connectionDetails, 0);
        connectionStateHandler.receivedAddMemberEvent(pendingClientId, protocolHandler.quorum);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        // Mock as though the client sent some ops.
        shouldClientJoinWrite = true;
        connectionStateHandler.setDirtyState();
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(new EventEmitter(), client.mode, connectionDetails, 0);
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId, protocolHandler.quorum);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should be in connecting state as we are waiting for leave");

        // Send leave
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should be in connected state");
    });

    it("Should wait for timeout before moving to conencted state if no leave received", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(new EventEmitter(), client.mode, connectionDetails, 0);
        connectionStateHandler.receivedAddMemberEvent(pendingClientId, protocolHandler.quorum);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        // Mock as though the client sent some ops.
        shouldClientJoinWrite = true;
        connectionStateHandler.setDirtyState();
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(new EventEmitter(), client.mode, connectionDetails, 0);
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId, protocolHandler.quorum);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should be in connecting state as we are waiting for timeout");

        // Check state before timeout
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should still be in connecting state as we are waiting for timeout");

        await tickClock(1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should now be in connected state");
    });

    afterEach(() => {
        clock.reset();
    });

    after(() => {
        clock.restore();
    });
});
