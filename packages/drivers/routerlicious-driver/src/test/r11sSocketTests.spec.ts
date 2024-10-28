/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IClient } from "@fluidframework/driver-definitions";
import {
	DriverErrorTypes,
	IResolvedUrl,
	type IAnyDriverError,
} from "@fluidframework/driver-definitions/internal";
import { stub } from "sinon";
import { Socket } from "socket.io-client";

import { DefaultTokenProvider } from "../defaultTokenProvider.js";
import { DocumentService } from "../documentService.js";
import { RouterliciousDocumentServiceFactory } from "../documentServiceFactory.js";
import {
	R11sServiceClusterDrainingErrorCode,
	RouterliciousErrorTypes,
} from "../errorUtils.js";
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

		let errorOccurred = false;
		try {
			await mockSocket(socket as unknown as Socket, async () =>
				documentService.connectToDeltaStream(client),
			);
		} catch (error) {
			errorOccurred = true;
			const anyDriverError = error as IAnyDriverError;
			assert(
				anyDriverError.errorType === DriverErrorTypes.authorizationError,
				"Error type should be authorizationError",
			);
			assert(
				anyDriverError.scenarioName === "connect_document_error",
				"Error scenario name should be connect_document_error",
			);
			assert(
				(anyDriverError as any).internalErrorCode === "TokenRevoked",
				"Error internal code should be TokenRevoked",
			);
		}
		assert(errorOccurred, "Error should have occurred");
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

		let errorOccurred = false;
		try {
			await mockSocket(socket as unknown as Socket, async () =>
				documentService.connectToDeltaStream(client),
			);
		} catch (error) {
			errorOccurred = true;
			const anyDriverError = error as IAnyDriverError;
			assert(
				anyDriverError.errorType === RouterliciousErrorTypes.clusterDrainingError,
				"Error type should be clusterDrainingError",
			);
			assert(
				anyDriverError.scenarioName === "connect_document_error",
				"Error scenario name should be connect_document_error",
			);
			assert(
				(anyDriverError as any).internalErrorCode === R11sServiceClusterDrainingErrorCode,
				"Error internal code should be R11sServiceClusterDrainingErrorCode",
			);
		}
		assert(errorOccurred, "Error should have occurred");
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
});
