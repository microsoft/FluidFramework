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
import { ConnectionState } from "../container";
import { ConnectionStateHandler } from "../connectionStateHandler";

describe("ConnectionStateHandler Tests", () => {
    let connectionStateHandler: ConnectionStateHandler;
    let protocolHandler: ProtocolOpHandler;
    let shouldClientJoinWrite: boolean;
    const client: IClient = {
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
    const pendingClientId = "pendingClientId";
    const connectionDetails: IConnectionDetails = {
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

    beforeEach(() => {
        protocolHandler = new ProtocolOpHandler(0, 0, 1, [], [], [], (key, value) => 0, (seqNum) => undefined);
        connectionStateHandler = new ConnectionStateHandler(
            {
                logConnectionStateChangeTelemetry: () => undefined,
                propagateConnectionState:() => undefined,
                isContainerLoaded: () => true,
                maxClientLeaveWaitTime: 30000,
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
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

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
});
