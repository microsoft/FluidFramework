/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockDocumentDeltaConnection, MockDocumentService } from "@fluid-private/test-loader-utils";
import { Deferred } from "@fluidframework/core-utils";
import {
	DriverErrorTypes,
	IAnyDriverError,
	IDocumentService,
} from "@fluidframework/driver-definitions";
import { NonRetryableError, RetryableError } from "@fluidframework/driver-utils";
import { IClient, INack, NackErrorType } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ConnectionManager } from "../connectionManager.js";
import { IConnectionManagerFactoryArgs } from "../contracts.js";
import { pkgVersion } from "../packageVersion.js";

describe("connectionManager", () => {
	let nextClientId = 0;
	let _mockDeltaConnection: MockDocumentDeltaConnection | undefined;
	let mockDocumentService: IDocumentService;
	const client: Partial<IClient> = {
		details: { capabilities: { interactive: true } },
		mode: "write",
	};
	let closed = false;
	let connectionCount = 0;
	let connectionDeferred = new Deferred<MockDocumentDeltaConnection>();
	let disconnectCount = 0;
	const props: IConnectionManagerFactoryArgs = {
		closeHandler: (_error) => {
			closed = true;
		},
		connectHandler: () => {
			++connectionCount;
			assert(
				_mockDeltaConnection !== undefined,
				"When connectHandler is invoked, _mockDeltaConnection should have been set",
			);
			connectionDeferred.resolve(_mockDeltaConnection);
			connectionDeferred = new Deferred();
		},
		disconnectHandler: () => {
			++disconnectCount;
		},
		incomingOpHandler: () => {},
		pongHandler: () => {},
		readonlyChangeHandler: () => {},
		reconnectionDelayHandler: () => {},
		signalHandler: () => {},
		establishConnectionHandler: () => {},
		cancelConnectionHandler: () => {},
	};

	const mockLogger = new MockLogger();
	async function waitForConnection() {
		return connectionDeferred.promise;
	}
	beforeEach(() => {
		nextClientId = 0;
		_mockDeltaConnection = undefined;
		closed = false;
		connectionCount = 0;
		connectionDeferred = new Deferred<MockDocumentDeltaConnection>();
		disconnectCount = 0;
		mockDocumentService = new MockDocumentService(undefined /* deltaStorageFactory */, () => {
			_mockDeltaConnection = new MockDocumentDeltaConnection(`mock_client_${nextClientId++}`);
			return _mockDeltaConnection;
		});
	});

	function createConnectionManager(): ConnectionManager {
		return new ConnectionManager(
			() => mockDocumentService,
			() => false,
			client as IClient,
			true /* reconnectAllowed */,
			mockLogger.toTelemetryLogger(),
			props,
		);
	}

	it("reconnectOnError - exceptions invoke closeHandler", async () => {
		// Arrange
		const connectionManager = createConnectionManager();
		connectionManager.connect({ text: "test:reconnectOnError" });
		const connection = await waitForConnection();

		// Monkey patch connection to be undefined to trigger assert in reconnectOnError
		(connectionManager as any).connection = undefined;

		// Act
		connection.emitError({
			errorType: DriverErrorTypes.genericError,
			message: "whatever",
			canRetry: true,
		});
		await Promise.resolve(); // So we get the promise rejection that calls closeHandler

		// Assert
		assert(
			closed,
			"ConnectionManager should close if reconnect throws an error, e.g. hits an assert",
		);
	});

	it("reconnectOnError - error, disconnect, and nack handling", async () => {
		// Arrange
		const connectionManager = createConnectionManager();
		connectionManager.connect({ text: "test:reconnectOnError" });
		let connection = await waitForConnection();

		// Act I - retryableError
		const error: IAnyDriverError = new RetryableError(
			"Retryable error",
			DriverErrorTypes.genericError,
			{ driverVersion: pkgVersion },
		);
		let oldConnection = connection;
		connection.emitError(error);
		connection = await waitForConnection();

		// Assert I
		assert(oldConnection.disposed, "Old connection should be disposed after emitting an error");
		assert.equal(
			connection.clientId,
			"mock_client_1",
			"New connection should have expected id",
		);
		assert(!closed, "Don't expect closeHandler to be called when connection emits an error");
		assert.equal(disconnectCount, 1, "Expected 1 disconnect from emitting an error");
		assert.equal(connectionCount, 2, "Expected 2 connections after the first emitted an error");

		// Act II - nonretryable disconnect
		const disconnectReason: IAnyDriverError = new NonRetryableError(
			"Fatal disconnect reason",
			DriverErrorTypes.genericError,
			{ driverVersion: pkgVersion },
		);
		oldConnection = connection;
		connection.emitDisconnect(disconnectReason);
		connection = await waitForConnection();

		// Assert II
		assert(
			oldConnection.disposed,
			"Old connection should be disposed after emitting disconnect",
		);
		assert.equal(
			connection.clientId,
			"mock_client_2",
			"New connection should have expected id",
		);
		mockLogger.assertMatchAny([
			{
				eventName: "reconnectingDespiteFatalError",
				reconnectMode: "Enabled",
				error: "Fatal disconnect reason",
				canRetry: false,
			},
		]);
		assert(
			!closed,
			"Don't expect closeHandler to be called even when connection emits a non-retryable disconnect",
		);
		assert.equal(
			disconnectCount,
			2,
			"Expected 2 disconnects from emitting an error and disconnect",
		);
		assert.equal(connectionCount, 3, "Expected 3 connections after the two disconnects");

		// Act III - nonretryable nack
		const nack: Partial<INack> = {
			content: { code: 403, type: NackErrorType.BadRequestError, message: "fatalNack" },
		};
		oldConnection = connection;
		connection.emitNack("docId", [nack]);

		// Assert III
		assert(closed, "closeHandler should be called in response to 403 nack");
		assert(
			!oldConnection.disposed,
			"connection shouldn't be disposed since mock closeHandler doesn't do it - don't expect it here after fatal nack",
		);
		assert(
			!mockLogger.matchEvents([{ eventName: "reconnectingDespiteFatalError" }]),
			"Should not see reconnectingDespiteFatalError event after fatal nack",
		);
	});

	it("reconnectOnError - nack retryAfter", async () => {
		const connectionManager = createConnectionManager();
		connectionManager.connect({ text: "test:reconnectOnError" });
		let connection = await waitForConnection();

		const nack: Partial<INack> = {
			content: {
				code: 429,
				type: NackErrorType.ThrottlingError,
				message: "throttled",
				retryAfter: 0.5, // 500 ms
			},
		};
		connection.emitNack("docId", [nack]);

		assert(!closed, "Don't expect closeHandler to be called with retryable Nack");
		assert(connection.disposed, "Expect connection to be disconnected");
		assert.strictEqual(disconnectCount, 1, "Expect 1 disconnect from emitting a Nack");

		// Async test we aren't connected within 300 ms
		let checkedTimeout = false;
		setTimeout(() => {
			assert.strictEqual(connectionCount, 1, "Expect there to still not be a connection yet");
			checkedTimeout = true;
		}, 300);

		connection = await waitForConnection();
		assert.strictEqual(connectionCount, 2, "Expect there to be a connection after waiting");
		assert(checkedTimeout, "Expected to have checked 300ms timeout");
	});

	describe("readonly", () => {
		it("default is undefined", () => {
			const connectionManager = createConnectionManager();
			assert.deepStrictEqual(connectionManager.readOnlyInfo, { readonly: undefined });
		});

		it("force readonly", () => {
			const connectionManager = createConnectionManager();

			connectionManager.forceReadonly(false);
			assert.deepStrictEqual(connectionManager.readOnlyInfo, { readonly: undefined });

			connectionManager.forceReadonly(true);
			assert.deepStrictEqual(connectionManager.readOnlyInfo, {
				readonly: true,
				forced: true,
				permissions: undefined,
				storageOnly: false,
				storageOnlyReason: undefined,
			});
		});

		it("readonly permissions", () => {
			const connectionManager = createConnectionManager();

			(connectionManager as any).set_readonlyPermissions(false);
			assert.deepStrictEqual(connectionManager.readOnlyInfo, { readonly: false });

			(connectionManager as any).set_readonlyPermissions(true);
			assert.deepStrictEqual(connectionManager.readOnlyInfo, {
				readonly: true,
				forced: false,
				permissions: true,
				storageOnly: false,
				storageOnlyReason: undefined,
			});
		});

		it("storage only", () => {
			const connectionManager = createConnectionManager();
			mockDocumentService.policies = { storageOnly: true };

			assert.deepStrictEqual(connectionManager.readOnlyInfo, { readonly: undefined });

			connectionManager.connect({ text: "test" });
			assert.deepStrictEqual(connectionManager.readOnlyInfo, {
				readonly: true,
				forced: false,
				permissions: true, // storageOnly also implies client does not have write permissions
				storageOnly: true,
				storageOnlyReason: undefined,
			});
		});
	});
});
