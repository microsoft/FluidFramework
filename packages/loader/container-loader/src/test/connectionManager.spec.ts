/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MockDocumentDeltaConnection, MockDocumentService } from "@fluid-private/test-loader-utils";
import { Deferred } from "@fluidframework/core-utils/internal";
import { IClient } from "@fluidframework/driver-definitions";
import {
	DriverErrorTypes,
	IAnyDriverError,
	IDocumentService,
	INack,
	NackErrorType,
} from "@fluidframework/driver-definitions/internal";
import { NonRetryableError, RetryableError } from "@fluidframework/driver-utils/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { stub, useFakeTimers } from "sinon";

import { ConnectionManager } from "../connectionManager.js";
import { IConnectionManagerFactoryArgs, ReconnectMode } from "../contracts.js";
import { pkgVersion } from "../packageVersion.js";

describe("connectionManager", () => {
	let clock;
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

	before(() => {
		clock = useFakeTimers();
	});

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

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});

	function createConnectionManager(
		customProps?: IConnectionManagerFactoryArgs,
	): ConnectionManager {
		return new ConnectionManager(
			() => mockDocumentService,
			() => false,
			client as IClient,
			true /* reconnectAllowed */,
			mockLogger.toTelemetryLogger(),
			customProps ?? props,
		);
	}

	it("reconnectOnError - exceptions invoke closeHandler", async () => {
		// Arrange
		const connectionManager = createConnectionManager();
		connectionManager.connect({ text: "test:reconnectOnError" }, "write");
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
		connectionManager.connect({ text: "test:reconnectOnError" }, "write");
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
		connectionManager.connect({ text: "test:reconnectOnError" }, "write");
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
		clock.tick(300);
		assert.strictEqual(connectionCount, 1, "Expect there to still not be a connection yet");
		clock.tick(200);
		connection = await waitForConnection();
		assert.strictEqual(connectionCount, 2, "Expect there to be a connection after waiting");
	});

	it("Does not re-try connection on error if ReconnectMode=Disabled", async () => {
		// mock connectToDeltaStream method so that it throws a retriable error when connect() is called in connectionManager
		const stubbedConnectToDeltaStream = stub(mockDocumentService, "connectToDeltaStream");
		const retryAfter = 3; // seconds
		stubbedConnectToDeltaStream.throws(
			// Throw retryable error
			new RetryableError("Test message", NackErrorType.ThrottlingError, {
				retryAfterSeconds: retryAfter,
				driverVersion: "1",
			}),
		);
		let isTimeoutSet = false;
		const connectionManager = createConnectionManager({
			...props,
			// reconnectionDelayHandler should be invoked by connectionManager when the throttling errors occur causing it to attept retries
			reconnectionDelayHandler: () => {
				// Ideally this function from deltaManager emits "throttled" warning event which is bubbled up as container warning that host can listen to
				// and call container.disconnect() if they wish.
				// Emulate calling container.disconnect() which results in setting connectionManager reconnect state as "Disabled" after random amount of time
				if (!isTimeoutSet) {
					isTimeoutSet = true;
					setTimeout(
						() => {
							connectionManager.setAutoReconnect(ReconnectMode.Disabled, {
								text: "Container disconnected",
							});
						},
						retryAfter * 1000 * 5,
					);
				}
			},
		});
		connectionManager.connect({ text: "Test reconnect" }, "write");

		await clock.tickAsync(retryAfter * 1000 * 10);
		assert(
			stubbedConnectToDeltaStream.callCount > 1,
			"Reconnection should have been attempted after failure",
		);

		const calledTimes = stubbedConnectToDeltaStream.callCount;
		clock.tick(retryAfter * 1000 * 10);
		assert.equal(
			stubbedConnectToDeltaStream.callCount,
			calledTimes,
			"Reattempt counts should remain the same as before i.e. no new attempts should be made after ReconnectMode.Disabled is set",
		);
		stubbedConnectToDeltaStream.restore();
	});

	it("Does try re-connection on error if ReconnectMode=Enabled", async () => {
		// mock connectToDeltaStream method so that it throws a retriable error when connect() is called in connectionManager
		const stubbedConnectToDeltaStream = stub(mockDocumentService, "connectToDeltaStream");
		const retryAfter = 3; // seconds
		stubbedConnectToDeltaStream.throws(
			// Throw retryable error
			new RetryableError("Test message", NackErrorType.ThrottlingError, {
				retryAfterSeconds: retryAfter,
				driverVersion: "1",
			}),
		);
		const connectionManager = createConnectionManager();
		connectionManager.connect({ text: "Test reconnect" }, "write");

		await clock.tickAsync(retryAfter * 1000 * 10);
		assert(
			stubbedConnectToDeltaStream.callCount > 1,
			"Reconnection should have been attempted after failure",
		);
		const calledTimes = stubbedConnectToDeltaStream.callCount;
		await clock.tickAsync(retryAfter * 1000 * 10);
		assert(
			stubbedConnectToDeltaStream.callCount > calledTimes,
			"Reattempt for connection should continue to happen",
		);
		stubbedConnectToDeltaStream.restore();
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

			connectionManager.connect({ text: "test" }, "write");
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
