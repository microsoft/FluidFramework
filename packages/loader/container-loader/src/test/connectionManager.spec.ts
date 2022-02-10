/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { IAnyDriverError, NonRetryableError, RetryableError } from "@fluidframework/driver-utils";
import { IClient, INack, NackErrorType } from "@fluidframework/protocol-definitions";
import { MockDocumentDeltaConnection, MockDocumentService } from "@fluidframework/test-loader-utils";
import { ConnectionManager } from "../connectionManager";
import { IConnectionManagerFactoryArgs } from "../contracts";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { Deferred } from "@fluidframework/common-utils";
import { pkgVersion } from "../packageVersion";

describe("connectionManager", () => {
    let nextClientId = 0;
    let mockDeltaConnection: MockDocumentDeltaConnection | undefined;
    const mockDocumentService = new MockDocumentService(
        undefined /* deltaStorageFactory */,
        () => { mockDeltaConnection = new MockDocumentDeltaConnection(`mock_client_${nextClientId++}`); return mockDeltaConnection },
    );
    const client: Partial<IClient> = {
        details: { capabilities: { interactive: true } },
        mode: "write",
    };
    let closed = false;
    let connectionCount = 0;
    let connectionReady = new Deferred<number>();
    let disconnectCount = 0;
    const props: IConnectionManagerFactoryArgs = {
        closeHandler: (_error) => { closed = true; },
        connectHandler: () => { connectionReady.resolve(++connectionCount); connectionReady = new Deferred(); },
        disconnectHandler: () => { ++disconnectCount; },
        incomingOpHandler: () => {},
        pongHandler: () => {},
        readonlyChangeHandler: () => {},
        reconnectionDelayHandler: () => {},
        signalHandler: () => {},
    };

    const mockLogger = new MockLogger();
    async function waitForConnection(n: number) {
        assert(await connectionReady.promise === n, `Test's connection state tracking is off [${n}]`);
    }
    beforeEach(() => {
        nextClientId = 0;
        mockDeltaConnection = undefined;
        closed = false;
        connectionCount = 0;
        connectionReady = new Deferred<number>();
        disconnectCount = 0;
    });

    it("reconnectOnError - exceptions invoke closeHandler", async () => {
        // Arrange
        const connectionManager = new ConnectionManager(
            () => mockDocumentService,
            client as IClient,
            true /* reconnectAllowed */,
            mockLogger,
            props,
        );
        connectionManager.connect();
        await waitForConnection(1);
        assert(mockDeltaConnection !== undefined);

        // Monkey path connection to be undefined to trigger assert in reconnectOnError
        (connectionManager as any).connection = undefined;

        // Act
        mockDeltaConnection.emitError({ errorType: DriverErrorType.genericError, message: "whatever", canRetry: true });
        await Promise.resolve(); // So we get the promise rejection that calls closeHandler

        // Assert
        assert(closed, "ConnectionManager should close if reconnect throws an error, e.g. hits an assert");
    });

    it("reconnectOnError - error, disconnect, and nack handling", async () => {
        // Arrange
        const connectionManager = new ConnectionManager(
            () => mockDocumentService,
            client as IClient,
            true /* reconnectAllowed */,
            mockLogger,
            props,
        );
        connectionManager.connect();
        await waitForConnection(1);
        assert(mockDeltaConnection !== undefined);

        // Act I - retryableError
        const error: IAnyDriverError =
            new RetryableError("retryableError", undefined, DriverErrorType.genericError, { driverVersion: pkgVersion });
        let oldDeltaConnection = mockDeltaConnection;
        mockDeltaConnection.emitError(error);
        await waitForConnection(2);

        // Assert I
        assert(oldDeltaConnection.disposed, "Old connection should be disposed after emitting an error");
        assert.equal(mockDeltaConnection.clientId, "mock_client_1", "New connection should have expected id");
        assert(!closed, "Don't expect closeHandler to be called when connection emits an error");
        assert.equal(disconnectCount, 1, "Expected 1 disconnect from emitting an error");
        assert.equal(connectionCount, 2, "Expected 2 connections after the first emitted an error");

        // Act II - nonretryable disconnect
        const disconnectReason: IAnyDriverError =
            new NonRetryableError("fatalDisconnectReason", undefined, DriverErrorType.genericError, { driverVersion: pkgVersion });
        oldDeltaConnection = mockDeltaConnection;
        mockDeltaConnection.emitDisconnect(disconnectReason);
        await waitForConnection(3);

        // Assert II
        assert(oldDeltaConnection.disposed, "Old connection should be disposed after emitting disconnect");
        assert.equal(mockDeltaConnection.clientId, "mock_client_2", "New connection should have expected id");
        mockLogger.assertMatchAny([{ eventName: "reconnectingDespiteFatalError", reconnectMode: "Enabled", error: "fatalDisconnectReason", canRetry: false, }]);
        assert(!closed, "Don't expect closeHandler to be called even when connection emits a non-retryable disconnect");
        assert.equal(disconnectCount, 2, "Expected 2 disconnects from emitting an error and disconnect");
        assert.equal(connectionCount, 3, "Expected 3 connections after the two disconnects");

        // Act III - nonretryable nack
        const nack: Partial<INack> = { content: { code: 403, type: NackErrorType.BadRequestError, message: "fatalNack"} };
        oldDeltaConnection = mockDeltaConnection;
        mockDeltaConnection.emitNack("docId", [nack]);

        // Assert III
        assert(!oldDeltaConnection.disposed, "connection shouldn't be disposed since mock closeHandler doesn't do it - don't expect it here after fatal nack");
        assert.equal(mockDeltaConnection, oldDeltaConnection, "Should not have gotten a new connection after fatal nack");
        mockLogger.assertMatch([], "Expected no logs sent, specifically not reconnectingDespiteFatalError event");
        assert(closed, "closeHandler should be called in response to 403 nack");
    });
});
