/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IClient } from "@fluidframework/driver-definitions";
import { IAnyDriverError } from "@fluidframework/driver-definitions/internal";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils/internal";
import { IOdspResolvedUrl, OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	MockLogger,
	isFluidError,
} from "@fluidframework/telemetry-utils/internal";
import { stub } from "sinon";
import { Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";

import { EpochTracker } from "../../epochTracker.js";
import { LocalPersistentCache } from "../../odspCache.js";
import { OdspDocumentDeltaConnection } from "../../odspDocumentDeltaConnection.js";
import { getHashedDocumentId } from "../../odspPublicUtils.js";
import * as socketModule from "../../socketModule.js";

import { ClientSocketMock } from "./socketMock.js";

describe("OdspDocumentDeltaConnection tests", () => {
	let tenantId = "tenantId";
	let documentId = "documentId";
	const token = "token";
	const client: IClient = {
		mode: "write",
		scopes: ["doc:read", "doc:write"],
		details: { capabilities: { interactive: true } },
		permission: [],
		user: { id: "userId" },
	};
	const webSocketUrl = "https://webSocketUrl";
	let logger: ITelemetryLoggerExt;
	const socketReferenceKeyPrefix = "prefix";
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "itemId";
	let epochTracker: EpochTracker;
	let localCache: LocalPersistentCache;
	let hashedDocumentId: string;
	const resolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;
	let socket: ClientSocketMock | undefined;

	before(async () => {
		hashedDocumentId = await getHashedDocumentId(driveId, itemId);
	});

	beforeEach(async () => {
		logger = new MockLogger().toTelemetryLogger();
		documentId = uuid();
		tenantId = uuid();
		// use null logger here as we expect errors
		epochTracker = new EpochTracker(
			localCache,
			{
				docId: hashedDocumentId,
				resolvedUrl,
			},
			logger,
		);
	});

	const checkListenerCount = (_socket: ClientSocketMock): void => {
		assert(
			_socket.listenerCount("connect_error") === 0,
			"no connect_error listener should exiist",
		);
		assert(
			_socket.listenerCount("connect_document_error") === 0,
			"no connect_document_error listener should exiist",
		);
		assert(
			_socket.listenerCount("connect_timeout") === 0,
			"no connect_timeout listener should exiist",
		);
		assert(
			_socket.listenerCount("connect_document_success") === 0,
			"no connect_document_success listener should exiist",
		);
		assert(
			_socket.listenerCount("server_disconnect") === 0,
			"no server_disconnect listener should exiist",
		);
		assert(
			_socket.listenerCount("get_ops_response") === 0,
			"no get_ops_response listener should exiist",
		);
		assert(
			_socket.listenerCount("flush_ops_response") === 0,
			"no flush_ops_response listener should exiist",
		);
		assert(_socket.listenerCount("error") === 0, "no error listener should exiist");
		assert(_socket.listenerCount("disconnect") === 0, "no disconnect listener should exiist");
	};

	afterEach(async () => {
		socket?.close();
		await epochTracker.removeEntries().catch(() => {});
	});

	async function mockSocket<T>(_response: Socket, callback: () => Promise<T>): Promise<T> {
		const getSocketCreationStub = stub(socketModule, "SocketIOClientStatic");
		getSocketCreationStub.returns(_response);
		try {
			return await callback();
		} finally {
			getSocketCreationStub.restore();
		}
	}

	it("Connect document success on connection", async () => {
		socket = new ClientSocketMock();
		const connection = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);
		assert.strictEqual(connection.documentId, documentId, "document id should match");
		assert(!connection.disposed, "connection should not be disposed");
		assert(connection.existing, "doucment should already exist");
		assert.strictEqual(connection.mode, "write", "connection should be write");

		let disconnectedEvent = false;
		connection.on("disconnect", (reason: IAnyDriverError) => {
			disconnectedEvent = true;
		});

		connection.dispose();
		assert(connection.disposed, "connection should be disposed now");
		assert(disconnectedEvent, "disconnect Event should happed");
		assert(socket.connected, "socket should still be connected");
	});

	it("Connect document error on connection", async () => {
		const errorToThrow = createOdspNetworkError("TestSocketError", 401);
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: "connect_document_error", errorToThrow },
		});
		let errorhappened = false;
		let connection: OdspDocumentDeltaConnection | undefined;
		try {
			connection = await mockSocket(socket as unknown as Socket, async () =>
				OdspDocumentDeltaConnection.create(
					tenantId,
					documentId,
					token,
					client,
					webSocketUrl,
					logger,
					60000,
					epochTracker,
					socketReferenceKeyPrefix,
				),
			);
		} catch (error) {
			errorhappened = true;
			assert(isFluidError(error), "should be a Fluid error");
			assert(error.message.includes("TestSocketError"), "error message should match");
			assert(
				error.errorType === OdspErrorTypes.genericNetworkError,
				"errortype should be correct",
			);
		}
		assert(connection === undefined, "connection should not happen");
		assert(errorhappened, "error should occur");
	});

	it("Connect error on connection", async () => {
		const errorToThrow = createOdspNetworkError("TestSocketError", 401);
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: "connect_error", errorToThrow },
		});
		let errorhappened = false;
		try {
			await mockSocket(socket as unknown as Socket, async () =>
				OdspDocumentDeltaConnection.create(
					tenantId,
					documentId,
					token,
					client,
					webSocketUrl,
					logger,
					60000,
					epochTracker,
					socketReferenceKeyPrefix,
				),
			);
		} catch (error) {
			errorhappened = true;
			assert(isFluidError(error), "should be a Fluid error");
			assert(error.message.includes("TestSocketError"), "error message should match");
			assert(
				error.errorType === OdspErrorTypes.genericNetworkError,
				"errortype should be correct",
			);
		}
		assert(errorhappened, "error should occur");
	});

	it("Connect timeout on connection", async () => {
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: "connect_timeout" },
		});
		let errorhappened = false;
		try {
			await mockSocket(socket as unknown as Socket, async () =>
				OdspDocumentDeltaConnection.create(
					tenantId,
					documentId,
					token,
					client,
					webSocketUrl,
					logger,
					60000,
					epochTracker,
					socketReferenceKeyPrefix,
				),
			);
		} catch (error) {
			errorhappened = true;
			assert(isFluidError(error), "should be a Fluid error");
			assert(error.message.includes("connect_timeout"), "error message should match");
			assert(
				error.errorType === OdspErrorTypes.genericNetworkError,
				"errortype should be correct",
			);
		}
		assert(errorhappened, "error should occur");
	});

	it("Connection object should handle server_disconnect event with clientId", async () => {
		socket = new ClientSocketMock();
		const connection = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);
		const errorToThrow = { message: "OdspSocketError", code: 400 };
		let errorReceived: IAnyDriverError | undefined;
		connection.on("disconnect", (reason: IAnyDriverError) => {
			errorReceived = reason;
		});
		socket.sendServerDisconnectEvent(errorToThrow, connection.clientId);

		assert(errorReceived !== undefined, "disconnect event should happen");
		assert(
			errorReceived.message.includes("server_disconnect"),
			"should container server disconnect event",
		);
		assert(errorReceived.errorType, OdspErrorTypes.genericNetworkError);
		assert(socket?.connected, "socket should still be connected");
		assert(
			socket.listenerCount("server_disconnect") === 1,
			"server_disconnect listener should still exiist",
		);
	});

	it("Connection object should handle server_disconnect event without clientId", async () => {
		socket = new ClientSocketMock();
		const connection = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);
		let errorReceived: IAnyDriverError | undefined;
		const errorToThrow = { message: "OdspSocketError", code: 400 };
		connection.on("disconnect", (reason: IAnyDriverError) => {
			errorReceived = reason;
		});
		socket.sendServerDisconnectEvent(errorToThrow);

		assert(errorReceived !== undefined, "disconnect event should happen");
		assert(
			errorReceived.message.includes("server_disconnect"),
			"should container server disconnect event",
		);
		assert(errorReceived.errorType, OdspErrorTypes.genericNetworkError);
		assert(socket !== undefined && !socket.connected, "socket should be disconnected");
		checkListenerCount(socket);
	});

	it("Connection object should handle disconnect event", async () => {
		socket = new ClientSocketMock();
		const connection = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);
		let errorReceived: IAnyDriverError | undefined;
		const errorToThrow = createOdspNetworkError("TestSocketError", 400);
		const details = { context: { code: 400, type: "badError" } };
		connection.on("disconnect", (reason: IAnyDriverError) => {
			errorReceived = reason;
		});
		socket.sendDisconnectEvent(errorToThrow, details);

		assert(errorReceived !== undefined, "disconnect event should happen");
		assert(
			errorReceived.message.includes("socket.io (disconnect): TestSocketError"),
			"should container disconnect event",
		);
		assert(errorReceived.errorType, OdspErrorTypes.genericNetworkError);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		assert((errorReceived as any).socketErrorType === details.context.type);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		assert((errorReceived as any).socketCode === details.context.code);
		assert(socket !== undefined && !socket.connected, "socket should be closed");
		checkListenerCount(socket);
	});

	it("Connection object should handle error event", async () => {
		socket = new ClientSocketMock();
		const connection = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);

		let errorReceived: IAnyDriverError | undefined;
		const errorToThrow = createOdspNetworkError("TestSocketError", 400);
		connection.on("disconnect", (reason: IAnyDriverError) => {
			errorReceived = reason;
		});
		socket.sendErrorEvent(errorToThrow);
		assert(errorReceived !== undefined, "disconnect event should happen");
		assert(
			errorReceived.message.includes("socket.io (error): TestSocketError"),
			"should container disconnect event",
		);
		assert(errorReceived.errorType, OdspErrorTypes.genericNetworkError);
		assert(socket !== undefined && !socket.connected, "socket should be closed");
		checkListenerCount(socket);
	});

	it("Multiple connection objects should handle server_disconnect event without clientId", async () => {
		socket = new ClientSocketMock();
		const connection1 = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);

		const connection2 = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);
		let disconnectedEvent1 = false;
		let disconnectedEvent2 = false;
		const errorToThrow = { message: "OdspSocketError", code: 400 };
		connection1.on("disconnect", (reason: IAnyDriverError) => {
			disconnectedEvent1 = true;
		});
		connection2.on("disconnect", (reason: IAnyDriverError) => {
			disconnectedEvent2 = true;
		});
		socket.sendServerDisconnectEvent(errorToThrow);

		assert(disconnectedEvent1, "disconnect event should happen on first object");
		assert(disconnectedEvent2, "disconnect event should happen on second object");

		assert(socket !== undefined && !socket.connected, "socket should be disconnected");
		checkListenerCount(socket);
	});

	it("Multiple connection objects should handle server_disconnect event with particular clientId", async () => {
		socket = new ClientSocketMock();
		const connection1 = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);

		const connection2 = await mockSocket(socket as unknown as Socket, async () =>
			OdspDocumentDeltaConnection.create(
				tenantId,
				documentId,
				token,
				client,
				webSocketUrl,
				logger,
				60000,
				epochTracker,
				socketReferenceKeyPrefix,
			),
		);
		let disconnectedEvent1 = false;
		let disconnectedEvent2 = false;
		const errorToThrow = { message: "OdspSocketError", code: 400 };
		connection1.on("disconnect", (reason: IAnyDriverError) => {
			disconnectedEvent1 = true;
		});
		connection2.on("disconnect", (reason: IAnyDriverError) => {
			disconnectedEvent2 = true;
		});
		socket.sendServerDisconnectEvent(errorToThrow, connection1.clientId);

		assert(disconnectedEvent1, "disconnect event should happen on first object");
		assert(!disconnectedEvent2, "disconnect event should not happen on second object");

		assert(socket.connected, "socket should be connected");
		assert(
			socket.listenerCount("server_disconnect") === 1,
			"server_disconnect listener should still exiist",
		);
		assert(socket.listenerCount("error") === 1, "1 error listener should exiist");
		assert(socket.listenerCount("disconnect") === 1, "1 disconnect listener should exiist");
		assert(
			socket.listenerCount("get_ops_response") === 1,
			"1 get_ops_response listener should exiist",
		);
	});
});
