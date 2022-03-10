/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
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
        protocolHandler = new ProtocolOpHandler(0, 0, 1, [], [], [], (key, value) => 0);
        connectionDetails = {
            clientId: pendingClientId,
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            claims: {} as ITokenClaims,
            existing: true,
            mode: "read",
            version: "0.1",
            initialClients: [],
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
                maxClientLeaveWaitTime: expectedTimeout,
                quorumClients: () => protocolHandler.quorum,
                shouldClientJoinWrite: () => shouldClientJoinWrite,
                logConnectionIssue: (eventName: string) => { throw new Error("logConnectionIssue"); },
                connectionStateChanged: () => {},
            },
            new TelemetryNullLogger(),
        );
    });

    it("Should move to connected state on normal flow for read client", async () => {
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Read Client should be in connected state");
    });

    it("Should move to connected state on normal flow for write client", async () => {
        client.mode = "write";
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client should be in connecting state");
        protocolHandler.quorum.addMember("anotherClientId", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent("anotherClientId");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Some other client joined.");
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");
    });

    it("Should wait for previous client to leave before moving to conencted state", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId2", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should be in connecting state as we are waiting for leave");

        // Send leave
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should be in connected state");
    });

    it("Should wait for timeout before moving to conencted state if no leave received", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId2", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);
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

    it("Should wait for Saved event before moving to conencted state if no leave received", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId2", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should be in connecting state as we are waiting for timeout");

        // Check state before timeout
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should still be in connecting state as we are waiting for timeout");

        // Fire the container saved event.
        connectionStateHandler.containerSaved();
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should now be in connected state");
    });

    it("Should wait for client 1 to leave before moving to conencted state(Client 3) when client 2 " +
        "got disconnected from connecting state", async () =>
    {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connecting state
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionDetails.clientId = "pendingClientId3";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId3", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);

        // Send leave for client 2 and check that client 3 should not move to conencted state as we were waiting
        // on client 1 leave
        connectionStateHandler.receivedRemoveMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");

        // Client 1 leaves.
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
        // Timeout should not raise any error as timer should be cleared
        await tickClock(expectedTimeout);
    });

    it("Should wait for client 1 timeout before moving to conencted state(Client 3) when client 2 " +
        "got disconnected from connecting state", async () =>
    {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connecting state
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionDetails.clientId = "pendingClientId3";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId3", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);

        // Send leave for client 2 and check that client 3 should not move to conencted state as we were waiting
        // on client 1 leave.
        connectionStateHandler.receivedRemoveMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");

        // Pass some time.
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state as timeout has not occured");

        await tickClock(1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
        // Sending client 1 leave now should not cause any error
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
    });

    it("Should wait for savedEvent before moving to conencted state(Client 3) when client 2 " +
        "got disconnected from connecting state", async () =>
    {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connecting state
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionDetails.clientId = "pendingClientId3";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId3", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);

        // Send leave for client 2 and check that client 3 should not move to conencted state as we were waiting
        // on client 1 leave.
        connectionStateHandler.receivedRemoveMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");

        // Pass some time.
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state as timeout has not occured");

        connectionStateHandler.containerSaved();
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
        // Sending client 1 leave now should not cause any error
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
    });

    it("Should wait for client 1 to leave before moving to conencted state(Client 3) when client 2 " +
        "got disconnected from connected state", async () =>
    {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connected state
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId2", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should still be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionDetails.clientId = "pendingClientId3";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId3", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");

        // Send leave for client 2 and check that client 3 should not move to conencted state as we were waiting
        // on client 1 leave
        connectionStateHandler.receivedRemoveMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");

        // Client 1 leaves.
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
        // Timeout should not raise any error as timer should be cleared
        await tickClock(expectedTimeout);
    });

    it("Should wait for client 1 timeout before moving to conencted state(Client 3) when client 2 " +
        "got disconnected from connected state", async () =>
    {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connecting state
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId2", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should still be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionDetails.clientId = "pendingClientId3";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId3", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);

        // Send leave for client 2 and check that client 3 should not move to conencted state as we were waiting
        // on client 1 leave.
        connectionStateHandler.receivedRemoveMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");

        // Pass some time.
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state as timeout has not occured");

        await tickClock(1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");

        // Sending client 1 leave now should not cause any error
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
    });

    it("Client 3 should wait for client 2(which got disconnected without sending any ops) to leave " +
        "when client 2 already waited on client 1", async () =>
    {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember(pendingClientId, { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connected state
        connectionDetails.clientId = "pendingClientId2";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        protocolHandler.quorum.addMember("pendingClientId2", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 2 should still be in connecting state");
        // Client 1 leaves.
        connectionStateHandler.receivedRemoveMemberEvent(pendingClientId);

        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should move to connected state");

        // Client 2 leaves without sending any ops.
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join. Now it should not wait for previous client as client 2 already waited.
        connectionDetails.clientId = "pendingClientId3";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");
        protocolHandler.quorum.addMember("pendingClientId3", { client, sequenceNumber: 0 });
        connectionStateHandler.receivedAddMemberEvent(connectionDetails.clientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connecting,
            "Client 3 should still be in connecting state");

        // Client 2 leaves.
        connectionStateHandler.receivedRemoveMemberEvent("pendingClientId2");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
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
