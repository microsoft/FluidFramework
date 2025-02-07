/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { IClient } from "@fluidframework/driver-definitions";
import {
	DriverErrorTypes,
	IResolvedUrl,
	type IAnyDriverError,
} from "@fluidframework/driver-definitions/internal";
import { stub } from "sinon";
import { Socket } from "socket.io-client";

import { R11sServiceClusterDrainingErrorCode } from "../contracts.js";
import { DefaultTokenProvider } from "../defaultTokenProvider.js";
import { DocumentService } from "../documentService.js";
import { RouterliciousDocumentServiceFactory } from "../documentServiceFactory.js";
import { RouterliciousErrorTypes } from "../errorUtils.js";
import * as socketModule from "../socketModule.js";
// eslint-disable-next-line import/no-internal-modules
import { ClientSocketMock } from "../test/socketTestUtils.ts/socketMock.js";

describe("R11s Socket Tests", () => {
	let documentService: DocumentService;
	let routerliciousDocumentServiceFactory: RouterliciousDocumentServiceFactory;
	// let deltaConnection: R11sDocumentDeltaConnection;
	let resolvedUrl: IResolvedUrl;
	let socket: ClientSocketMock | undefined;

	async function mockSocket<T>(_response: Socket, callback: () => Promise<T>): Promise<T> {
		const getSocketCreationStub = stub(socketModule, "SocketIOClientStatic");
		getSocketCreationStub.returns(_response);
		try {
			return await callback();
		} finally {
			getSocketCreationStub.restore();
		}
	}

	const client: IClient = {
		mode: "read",
		details: { capabilities: { interactive: true } },
		permission: [],
		user: { id: "id" },
		scopes: [],
	};

	beforeEach(async () => {
		routerliciousDocumentServiceFactory = new RouterliciousDocumentServiceFactory(
			new DefaultTokenProvider("jwt"),
		);
		resolvedUrl = {
			type: "fluid",
			id: "id",
			url: "https://mock.url/tenantId/documentId",
			endpoints: {
				ordererUrl: "ordererUrl",
				storageUrl: "storageUrl",
				deltaStorageUrl: "deltaStorageUrl",
				deltaStreamUrl: "deltaStreamUrl",
			},
			tokens: {},
		};
		documentService = (await routerliciousDocumentServiceFactory.createDocumentService(
			resolvedUrl,
		)) as DocumentService;
	});

	it("connect_document_error with Token Revoked error", async () => {
		const errorToThrow = {
			code: 403,
			message: "TokenRevokedError",
			retryAfterMs: 10,
			internalErrorCode: "TokenRevoked",
			errorType: DriverErrorTypes.authorizationError,
			canRetry: false,
		};
		const errorEventName = "connect_document_error";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName, errorToThrow },
		});

		await assert.rejects(
			mockSocket(socket as unknown as Socket, async () =>
				documentService.connectToDeltaStream(client),
			),
			{
				errorType: DriverErrorTypes.authorizationError,
				scenarioName: "connect_document_error",
				internalErrorCode: "TokenRevoked",
			},
			"Error should have occurred",
		);
	});

	it("Socket error with Token Revoked error", async () => {
		const errorToThrow = {
			code: 403,
			message: "TokenRevokedError",
			retryAfterMs: 10,
			internalErrorCode: "TokenRevoked",
			errorType: DriverErrorTypes.authorizationError,
			canRetry: false,
		};
		const errorEventName = "connect_document_success";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName },
		});

		const connection = await mockSocket(socket as unknown as Socket, async () =>
			documentService.connectToDeltaStream(client),
		);
		let error: IAnyDriverError | undefined;
		connection.on("disconnect", (reason: IAnyDriverError) => {
			error = reason;
		});

		// Send Token Revoked error
		socket.sendErrorEvent(errorToThrow);

		assert(
			error?.errorType === DriverErrorTypes.authorizationError,
			"Error type should be authorizationError",
		);
		assert(error.scenarioName === "error", "Error scenario name should be error");
		assert(
			(error as any).internalErrorCode === "TokenRevoked",
			"Error internal code should be TokenRevoked",
		);
	});

	it("connect_document_error with Cluster Draining error", async () => {
		const errorToThrow = {
			code: 503,
			message: "ClusterDrainingError",
			retryAfterMs: 1000,
			internalErrorCode: R11sServiceClusterDrainingErrorCode,
			errorType: RouterliciousErrorTypes.clusterDrainingError,
			canRetry: true,
		};
		const errorEventName = "connect_document_error";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName, errorToThrow },
		});

		await assert.rejects(
			mockSocket(socket as unknown as Socket, async () =>
				documentService.connectToDeltaStream(client),
			),
			{
				errorType: RouterliciousErrorTypes.clusterDrainingError,
				scenarioName: "connect_document_error",
				internalErrorCode: R11sServiceClusterDrainingErrorCode,
			},
			"Error should have occurred",
		);
	});

	it("Socket error with Cluster Draining error", async () => {
		const errorToThrow = {
			code: 503,
			message: "ClusterDrainingError",
			retryAfterMs: 1000,
			internalErrorCode: R11sServiceClusterDrainingErrorCode,
			errorType: RouterliciousErrorTypes.clusterDrainingError,
			canRetry: true,
		};
		const errorEventName = "connect_document_success";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName },
		});

		const connection = await mockSocket(socket as unknown as Socket, async () =>
			documentService.connectToDeltaStream(client),
		);
		let error: IAnyDriverError | undefined;
		connection.on("disconnect", (reason: IAnyDriverError) => {
			error = reason;
		});

		// Send Token Revoked error
		socket.sendErrorEvent(errorToThrow);

		assert(
			error?.errorType === RouterliciousErrorTypes.clusterDrainingError,
			"Error type should be clusterDrainingError",
		);
		assert(error.scenarioName === "error", "Error scenario name should be error");
		assert(
			(error as any).internalErrorCode === R11sServiceClusterDrainingErrorCode,
			"Error internal code should be R11sServiceClusterDrainingErrorCode",
		);
	});

	it("Socket error with Data Corruption error", async () => {
		const errorToThrow = {
			code: 500,
			message: "Data corruption detected",
			retryAfterMs: 0,
			internalErrorCode: "DataCorruption",
			errorType: FluidErrorTypes.dataCorruptionError,
			canRetry: false,
		};
		const errorEventName = "connect_document_success";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName },
		});

		const connection = await mockSocket(socket as unknown as Socket, async () =>
			documentService.connectToDeltaStream(client),
		);
		let error: IAnyDriverError | undefined;
		connection.on("disconnect", (reason: IAnyDriverError) => {
			error = reason;
		});

		// Send Data Corruption error
		socket.sendErrorEvent(errorToThrow);

		assert(
			error?.errorType === FluidErrorTypes.dataCorruptionError,
			"Error type should be dataCorruptionError",
		);
		assert(error.scenarioName === "error", "Error scenario name should be error");
		assert(
			(error as any).internalErrorCode === "DataCorruption",
			"Error internal code should be DataCorruption",
		);
	});

	it("Socket error with Data Processing error", async () => {
		const errorToThrow = {
			code: 500,
			message: "Data processing error",
			retryAfterMs: 0,
			internalErrorCode: "DataProcessing",
			errorType: FluidErrorTypes.dataProcessingError,
			canRetry: false,
		};
		const errorEventName = "connect_document_success";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName },
		});

		const connection = await mockSocket(socket as unknown as Socket, async () =>
			documentService.connectToDeltaStream(client),
		);
		let error: IAnyDriverError | undefined;
		connection.on("disconnect", (reason: IAnyDriverError) => {
			error = reason;
		});

		// Send Data Processing error
		socket.sendErrorEvent(errorToThrow);

		assert(
			error?.errorType === "dataProcessingError",
			"Error type should be dataProcessingError",
		);
		assert(error.scenarioName === "error", "Error scenario name should be error");
		assert(
			(error as any).internalErrorCode === "DataProcessing",
			"Error internal code should be DataProcessing",
		);
	});

	it("Verifies disconnect_document event is emitted with corruption flag for data corruption", async () => {
		const errorToThrow = {
			code: 500,
			message: "Data corruption detected",
			retryAfterMs: 0,
			internalErrorCode: "DataCorruption",
			errorType: "dataCorruptionError",
			canRetry: false,
		};
		const errorEventName = "connect_document_success";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName },
		});

		await mockSocket(socket as unknown as Socket, async () =>
			documentService.connectToDeltaStream(client),
		);

		let disconnectDocumentCalled = false;
		let isCorruptionFlag = false;
		socket.on(
			"disconnect_document",
			(clientId: string, docId: string, errorType: string, isCorruption: boolean) => {
				disconnectDocumentCalled = true;
				isCorruptionFlag = isCorruption;
			},
		);

		// Send Data Corruption error
		socket.sendErrorEvent(errorToThrow);

		assert(disconnectDocumentCalled, "disconnect_document event should be emitted");
		assert(isCorruptionFlag, "isCorruption flag should be true for data corruption error");
	});
});
