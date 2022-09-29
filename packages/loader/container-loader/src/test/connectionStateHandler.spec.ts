/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { TelemetryNullLogger, TypedEventEmitter } from "@fluidframework/common-utils";
import { IClient, IClientConfiguration, ITokenClaims, ISequencedClient } from "@fluidframework/protocol-definitions";
import { IConnectionDetails, IDeltaManager, IDeltaManagerEvents } from "@fluidframework/container-definitions";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { ConnectionState } from "../connectionState";
import {
    IConnectionStateHandlerInputs,
    IConnectionStateHandler,
    createConnectionStateHandlerCore,
} from "../connectionStateHandler";
import { Audience } from "../audience";
import { ProtocolHandler } from "../protocol";

class MockDeltaManagerForCatchingUp
    extends TypedEventEmitter<IDeltaManagerEvents>
    implements Pick<IDeltaManager<any, any>, "lastSequenceNumber" | "lastKnownSeqNumber">
{ // eslint-disable-line @typescript-eslint/brace-style
    lastSequenceNumber: number = 5;
    lastKnownSeqNumber: number = 10;
    catchUp() {
        this.emit("op", { sequenceNumber: this.lastKnownSeqNumber });
    }
}

describe("ConnectionStateHandler Tests", () => {
    let clock: SinonFakeTimers;
    let handlerInputs: IConnectionStateHandlerInputs;
    let connectionStateHandler: IConnectionStateHandler;
    let protocolHandler: ProtocolHandler;
    let shouldClientJoinWrite: boolean;
    let connectionDetails: IConnectionDetails;
    let connectionDetails2: IConnectionDetails;
    let connectionDetails3: IConnectionDetails;
    let client: IClient;
    const expectedTimeout = 90000;
    const pendingClientId = "pendingClientId";
    const pendingClientId2 = "pendingClientId2";
    const pendingClientId3 = "pendingClientId3";
    let deltaManagerForCatchingUp: MockDeltaManagerForCatchingUp;
    let connectionStateHandler_receivedAddMemberEvent: (id: string) => void;
    let connectionStateHandler_receivedRemoveMemberEvent: (id: string) => void;

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

    function createHandler(connectedRaisedWhenCaughtUp: boolean) {
        const handler = createConnectionStateHandlerCore(
            connectedRaisedWhenCaughtUp,
            handlerInputs,
            deltaManagerForCatchingUp as any,
            undefined);
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
            existing: true,
            mode: "read",
            version: "0.1",
            initialClients: [],
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            serviceConfiguration: {} as IClientConfiguration,
            checkpointSequenceNumber: undefined,
        };
        connectionDetails2 = {
            clientId: pendingClientId2,
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
        connectionDetails3 = {
            clientId: pendingClientId3,
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
        protocolHandler = new ProtocolHandler(
            { minimumSequenceNumber: 0, sequenceNumber: 0, term: 1 }, // attributes
            { members: [], proposals: [], values: [] }, // quorumSnapshot
            (key, value) => 0, // sendProposal
            new Audience(),
        );
        shouldClientJoinWrite = false;
        handlerInputs = {
            maxClientLeaveWaitTime: expectedTimeout,
            shouldClientJoinWrite: () => shouldClientJoinWrite,
            logConnectionIssue: (eventName: string, details?: ITelemetryProperties) => { throw new Error(`logConnectionIssue: ${eventName} ${JSON.stringify(details)}`); },
            connectionStateChanged: () => { },
            logger: new TelemetryNullLogger(),
        };

        deltaManagerForCatchingUp = new MockDeltaManagerForCatchingUp();

        connectionStateHandler = createHandler(
            false); // connectedRaisedWhenCaughtUp

        connectionStateHandler_receivedAddMemberEvent =
            (id: string) => { protocolHandler.quorum.addMember(id, { client: {} } as any as ISequencedClient); };
        connectionStateHandler_receivedRemoveMemberEvent =
            (id: string) => { protocolHandler.quorum.removeMember(id); };
    });

    it("Should move to connected state on normal flow for read client", async () => {
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Read Client should be in connected state");
    });

    it("Should move to connected after catching up for read client", async () => {
        connectionStateHandler = createHandler(
            true); // connectedRaisedWhenCaughtUp

        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in Disconnected state");
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client should be in CatchingUp state");
        deltaManagerForCatchingUp.catchUp();
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Read Client should be in Connected state");
    });

    it("Should move to connected state on normal flow for write client", async () => {
        client.mode = "write";
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client should be in connecting state");
        connectionStateHandler_receivedAddMemberEvent("anotherClientId");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Some other client joined.");
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");
    });

    it("Should move to connected state after catching up for write client", async () => {
        client.mode = "write";
        connectionStateHandler = createHandler(
            true); // connectedRaisedWhenCaughtUp

        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in Disconnected state");
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client should be in CatchingUp state");
        connectionStateHandler_receivedAddMemberEvent("anotherClientId");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Some other client joined.");
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client should be in CatchingUp state until caught up");
        deltaManagerForCatchingUp.catchUp();
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in Connected state");
    });

    it("Should move to connected state on normal flow for write client, even if quorum isn't initialized at first", async () => {
        // swap out quorumClients fn for one that returns undefined at first
        // ConnectionStateManager without initialized protocol
        connectionStateHandler = createConnectionStateHandlerCore(
            false, // connectedRaisedWhenCaughtUp,
            handlerInputs,
            deltaManagerForCatchingUp as any,
            undefined);

        client.mode = "write";
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client should be in connecting state");

        connectionStateHandler_receivedAddMemberEvent(pendingClientId);

        // init protocol
        connectionStateHandler.initProtocol(protocolHandler);

        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");
    });

    it("Should wait for previous client to leave before moving to connected state", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should be in connecting state as we are waiting for leave");

        // Send leave
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should be in connected state");
    });

    it("Should wait for previous client to leave before moving to connected state, even if already in quorum", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        // Put Client 2 in quorum before receiving connect event
        connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should be in connecting state as we are waiting for leave");

        // Send leave
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should be in connected state");
    });

    it("read connection following write connection won't have leave timer", async () => {
        // Connect a write client, to be Disconnected
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        // Disconnect the first client, indicating all pending ops were ack'd
        shouldClientJoinWrite = false;
        client.mode = "write";
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join as read - no waiting for leave since shouldClientJoinWrite is false
        client.mode = "read";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should be in connected state");
    });

    it("Should wait for timeout before moving to connected state if no leave received", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should be in connecting state as we are waiting for timeout");

        // Check state before timeout
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should still be in connecting state as we are waiting for timeout");

        await tickClock(1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should now be in connected state");
    });

    it("Should wait for Saved event before moving to connected state if no leave received", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client should be in disconnected state");

        // Make new client join so that it waits for previous client to leave
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should be in connecting state as we are waiting for timeout");

        // Check state before timeout
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should still be in connecting state as we are waiting for timeout");

        // Fire the container saved event.
        connectionStateHandler.containerSaved();
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 2 should now be in connected state");
    });

    it("All pending state should be cleared after disconnect", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        assert(connectionStateHandler.pendingClientId !== undefined, "pendingClientId should be set after receiving 'connect' event");

        connectionStateHandler.receivedDisconnectEvent("test");
        assert(connectionStateHandler.pendingClientId === undefined, "pendingClientId should not be set after receiving 'disconnect' event");
    });

    it("Should wait for client 1 to leave before moving to connected state(Client 3) when client 2 got disconnected from connecting state", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connecting state
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails3);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

        // Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
        // on client 1 leave
        connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 3 should still be in connecting state");

        // Client 1 leaves.
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
        // Timeout should not raise any error as timer should be cleared
        await tickClock(expectedTimeout);
    });

    it("Should wait for client 1 timeout before moving to connected state(Client 3) when client 2 got disconnected from connecting state", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connecting state
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails3);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

        // Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
        // on client 1 leave.
        connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 3 should still be in connecting state");

        // Pass some time.
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 3 should still be in connecting state as timeout has not occured");

        await tickClock(1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
        // Sending client 1 leave now should not cause any error
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
    });

    it("Should wait for savedEvent before moving to connected state(Client 3) when client 2 got disconnected from connecting state", async () => {
        client.mode = "write";
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 1 should be in connected state");

        shouldClientJoinWrite = true;
        client.mode = "write";
        // Disconnect the client
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 1 should be in disconnected state");

        // Make new client join but disconnect it from connecting state
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 2 should be in connecting state");
        connectionStateHandler.receivedDisconnectEvent("Test");
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
            "Client 2 should be in disconnected state");

        // Make new client 3 join so that it waits for client 1 to leave
        connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails3);
        connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

        // Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
        // on client 1 leave.
        connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 3 should still be in connecting state");

        // Pass some time.
        await tickClock(expectedTimeout - 1);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
            "Client 3 should still be in connecting state as timeout has not occured");

        connectionStateHandler.containerSaved();
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
        // Sending client 1 leave now should not cause any error
        connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
        assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
            "Client 3 should move to connected state");
    });

    it("Should wait for client 1 to leave before moving to connected state(Client 3) when client 2 " +
        "got disconnected from connected state", async () => {
            client.mode = "write";
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
                "Client 1 should be in connected state");

            shouldClientJoinWrite = true;
            client.mode = "write";
            // Disconnect the client
            connectionStateHandler.receivedDisconnectEvent("Test");
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
                "Client 1 should be in disconnected state");

            // Make new client join but disconnect it from connected state
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 2 should still be in connecting state");
            connectionStateHandler.receivedDisconnectEvent("Test");
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
                "Client 2 should be in disconnected state");

            // Make new client 3 join so that it waits for client 1 to leave
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails3);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId3);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 3 should still be in connecting state");

            // Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
            // on client 1 leave
            connectionStateHandler_receivedRemoveMemberEvent(pendingClientId2);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 3 should still be in connecting state");

            // Client 1 leaves.
            connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
                "Client 3 should move to connected state");
            // Timeout should not raise any error as timer should be cleared
            await tickClock(expectedTimeout);
        });

    it("Should wait for client 1 timeout before moving to connected state(Client 3) when client 2 " +
        "got disconnected from connected state", async () => {
            client.mode = "write";
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
                "Client 1 should be in connected state");

            shouldClientJoinWrite = true;
            client.mode = "write";
            // Disconnect the client
            connectionStateHandler.receivedDisconnectEvent("Test");
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
                "Client 1 should be in disconnected state");

            // Make new client join but disconnect it from connecting state
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 2 should still be in connecting state");
            connectionStateHandler.receivedDisconnectEvent("Test");
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
                "Client 2 should be in disconnected state");

            // Make new client 3 join so that it waits for client 1 to leave
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails3);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId3);

            // Send leave for client 2 and check that client 3 should not move to connected state as we were waiting
            // on client 1 leave.
            connectionStateHandler_receivedRemoveMemberEvent("pendingClientId2");
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 3 should still be in connecting state");

            // Pass some time.
            await tickClock(expectedTimeout - 1);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 3 should still be in connecting state as timeout has not occured");

            await tickClock(1);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
                "Client 3 should move to connected state");

            // Sending client 1 leave now should not cause any error
            connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
                "Client 3 should move to connected state");
        });

    it("Client 3 should wait for client 2(which got disconnected without sending any ops) to leave " +
        "when client 2 already waited on client 1", async () => {
            client.mode = "write";
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
                "Client 1 should be in connected state");

            shouldClientJoinWrite = true;
            client.mode = "write";
            // Disconnect the client
            connectionStateHandler.receivedDisconnectEvent("Test");
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
                "Client 1 should be in disconnected state");

            // Make new client join but disconnect it from connected state
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails2);
            connectionStateHandler_receivedAddMemberEvent(pendingClientId2);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 2 should still be in connecting state");
            // Client 1 leaves.
            connectionStateHandler_receivedRemoveMemberEvent(pendingClientId);

            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Connected,
                "Client 2 should move to connected state");

            // Client 2 leaves without sending any ops.
            connectionStateHandler.receivedDisconnectEvent("Test");
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.Disconnected,
                "Client 2 should be in disconnected state");

            // Make new client 3 join. Now it should not wait for previous client as client 2 already waited.
            connectionStateHandler.receivedConnectEvent(client.mode, connectionDetails3);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 3 should still be in connecting state");
            connectionStateHandler_receivedAddMemberEvent(pendingClientId3);
            assert.strictEqual(connectionStateHandler.connectionState, ConnectionState.CatchingUp,
                "Client 3 should still be in connecting state");

            // Client 2 leaves.
            connectionStateHandler_receivedRemoveMemberEvent("pendingClientId2");
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
