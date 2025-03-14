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
import {
	DataProcessingError,
	DataCorruptionError,
} from "@fluidframework/telemetry-utils/internal";
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

	function runConnectDocumentErrorTest(
		description: string,
		errorToThrow: any,
		expectedErrorType: string,
		expectedInternalErrorCode: string,
	) {
		it(description, async () => {
			const errorEventName = "connect_document_error";
			socket = new ClientSocketMock({
				connect_document: { eventToEmit: errorEventName, errorToThrow },
			});
			await assert.rejects(
				mockSocket(socket as unknown as Socket, async () =>
					documentService.connectToDeltaStream(client),
				),
				{
					errorType: expectedErrorType,
					scenarioName: errorEventName,
					internalErrorCode: expectedInternalErrorCode,
				},
				"Error should have occurred",
			);
		});
	}

	function runSocketErrorTest(
		description: string,
		errorToThrow: any,
		expectedErrorType: string,
		expectedInternalErrorCode: string,
	) {
		it(description, async () => {
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
			socket.sendErrorEvent(errorToThrow);
			assert(
				error?.errorType === expectedErrorType,
				`Error type should be ${expectedErrorType}`,
			);
			assert(error.scenarioName === "error", "Error scenario name should be error");
			assert(
				(error as any).internalErrorCode === expectedInternalErrorCode,
				`Error internal code should be ${expectedInternalErrorCode}`,
			);
		});
	}

	function runClientErrorTest(
		description: string,
		clientError: any,
		expectedErrorType: string,
	) {
		it(description, async () => {
			const socketEventName = "connect_document_success";
			socket = new ClientSocketMock({
				connect_document: { eventToEmit: socketEventName },
			});
			const connection = await mockSocket(socket as unknown as Socket, async () =>
				documentService.connectToDeltaStream(client),
			);
			const disconnectEventP = new Promise<{ clientId: string; errorType: string }>(
				(resolve) => {
					assert(socket !== undefined, "Socket should be defined");
					socket.on(
						"abnormal_disconnect",
						(clientId: string, _documentId: string, errorType: string) => {
							resolve({ clientId, errorType });
						},
					);
				},
			);
			(connection as any).disconnect(clientError);
			const disconnectResult = await disconnectEventP;
			assert.strictEqual(
				disconnectResult.clientId,
				connection.clientId,
				"Client ID should match",
			);
			assert.strictEqual(
				disconnectResult.errorType,
				expectedErrorType,
				`Error type should be ${expectedErrorType}`,
			);
		});
	}

	// connect_document_error tests
	const connectErrorTests = [
		{
			description: "connect_document_error with Token Revoked error",
			errorToThrow: {
				code: 403,
				message: "TokenRevokedError",
				retryAfterMs: 10,
				internalErrorCode: "TokenRevoked",
				errorType: DriverErrorTypes.authorizationError,
				canRetry: false,
			},
			expectedErrorType: DriverErrorTypes.authorizationError,
			expectedInternalErrorCode: "TokenRevoked",
		},
		{
			description: "connect_document_error with Cluster Draining error",
			errorToThrow: {
				code: 503,
				message: "ClusterDrainingError",
				retryAfterMs: 1000,
				internalErrorCode: R11sServiceClusterDrainingErrorCode,
				errorType: RouterliciousErrorTypes.clusterDrainingError,
				canRetry: true,
			},
			expectedErrorType: RouterliciousErrorTypes.clusterDrainingError,
			expectedInternalErrorCode: R11sServiceClusterDrainingErrorCode,
		},
	];

	for (const test of connectErrorTests.values()) {
		runConnectDocumentErrorTest(
			test.description,
			test.errorToThrow,
			test.expectedErrorType,
			test.expectedInternalErrorCode,
		);
	}

	// Socket error tests
	const socketErrorTests = [
		{
			description: "Socket error with Token Revoked error",
			errorToThrow: {
				code: 403,
				message: "TokenRevokedError",
				retryAfterMs: 10,
				internalErrorCode: "TokenRevoked",
				errorType: DriverErrorTypes.authorizationError,
				canRetry: false,
			},
			expectedErrorType: DriverErrorTypes.authorizationError,
			expectedInternalErrorCode: "TokenRevoked",
		},
		{
			description: "Socket error with Cluster Draining error",
			errorToThrow: {
				code: 503,
				message: "ClusterDrainingError",
				retryAfterMs: 1000,
				internalErrorCode: R11sServiceClusterDrainingErrorCode,
				errorType: RouterliciousErrorTypes.clusterDrainingError,
				canRetry: true,
			},
			expectedErrorType: RouterliciousErrorTypes.clusterDrainingError,
			expectedInternalErrorCode: R11sServiceClusterDrainingErrorCode,
		},
	];

	socketErrorTests.forEach((test) =>
		runSocketErrorTest(
			test.description,
			test.errorToThrow,
			test.expectedErrorType,
			test.expectedInternalErrorCode,
		),
	);

	// Client error tests
	runClientErrorTest(
		"Client Data Corruption error",
		new DataCorruptionError("Data corruption error", { driverVersion: "1.0" }),
		FluidErrorTypes.dataCorruptionError,
	);

	runClientErrorTest(
		"Client Data Processing error",
		DataProcessingError.create("Data processing error", "test", undefined, {
			driverVersion: "1.0",
		}),
		FluidErrorTypes.dataProcessingError,
	);
});
