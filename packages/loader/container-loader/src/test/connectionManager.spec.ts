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
    it("reconnectOnError", async () => {
        // Arrange
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
        let connectionDeferred: Deferred<number> = new Deferred();
        let disconnectCount = 0;
        const props: IConnectionManagerFactoryArgs = {
            closeHandler: (_error) => { closed = true; },
            connectHandler: () => { connectionDeferred.resolve(++connectionCount); connectionDeferred = new Deferred(); },
            disconnectHandler: () => { ++disconnectCount; },
            incomingOpHandler: () => {},
            pongHandler: () => {},
            readonlyChangeHandler: () => {},
            reconnectionDelayHandler: () => {},
            signalHandler: () => {},
        };

        const mockLogger = new MockLogger();
        const connectionManager = new ConnectionManager(
            () => mockDocumentService,
            client as IClient,
            true /* reconnectAllowed */,
            mockLogger,
            props,
        );

        async function waitForConnection(n: number) {
            assert(await connectionDeferred.promise === n, `Test's connection state tracking is off [${n}]`);
        }

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
        assert      (oldDeltaConnection.disposed, "Old connection should be disposed after emitting an error");
        assert.equal(mockDeltaConnection.clientId, `mock_client_${nextClientId-1}`, "New connection should have expected id");
        assert      (!closed, "Don't expect closeHandler to be called when connection emits an error");
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
        assert.equal(mockDeltaConnection.clientId, `mock_client_${nextClientId-1}`, "New connection should have expected id");
        mockLogger.assertMatchAny([{ eventName: "reconnectingDespiteFatalError", reconnectMode: "Enabled", error: "fatalDisconnectReason", canRetry: false, }]);
        assert(!closed, "Don't expect closeHandler to be called even when connection emits a non-retryable disconnect");
        assert.equal(disconnectCount, 2, "Expected 2 disconnects from emitting an error and disconnect");
        assert.equal(connectionCount, 3, "Expected 3 connections after the two disconnects");

        // Act III - nonretryable nack
        const nack: Partial<INack> = { content: { code: 403, type: NackErrorType.BadRequestError, message: "fatalNack"} };
        oldDeltaConnection = mockDeltaConnection;
        mockDeltaConnection.emitNack("docId", [nack]);

        // Assert III
        assert(oldDeltaConnection.disposed, "Old connection should be disposed after emitting nack");
        assert.equal(mockDeltaConnection.clientId, `mock_client_${nextClientId-1}`, "New connection should have expected id");
        mockLogger.assertMatchAny([{ eventName: "reconnectingDespiteFatalError", reconnectMode: "Enabled", statusCode: 403, canRetry: false, }]);
        assert(closed, "closeHandler should be called in response to 403 nack");
        assert.equal(disconnectCount, 3, "Expected 2 disconnects from emitting an error and disconnect");
        assert.equal(connectionCount, 3, "Expected 3 connections after the two disconnects");

    });
});
