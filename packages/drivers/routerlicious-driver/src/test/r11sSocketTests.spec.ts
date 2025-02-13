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
	DataCorruptionError,
	DataProcessingError,
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

	interface ErrorTestCase {
		name: string;
		error: {
			code: number;
			message: string;
			retryAfterMs: number;
			internalErrorCode: string;
			errorType: string;
			canRetry: boolean;
		};
		expectedError: {
			errorType: string;
			internalErrorCode: string;
		};
	}

	const errorTestCases: ErrorTestCase[] = [
		{
			name: "Token Revoked error",
			error: {
				code: 403,
				message: "TokenRevokedError",
				retryAfterMs: 10,
				internalErrorCode: "TokenRevoked",
				errorType: DriverErrorTypes.authorizationError,
				canRetry: false,
			},
			expectedError: {
				errorType: DriverErrorTypes.authorizationError,
				internalErrorCode: "TokenRevoked",
			},
		},
		{
			name: "Cluster Draining error",
			error: {
				code: 503,
				message: "ClusterDrainingError",
				retryAfterMs: 1000,
				internalErrorCode: R11sServiceClusterDrainingErrorCode,
				errorType: RouterliciousErrorTypes.clusterDrainingError,
				canRetry: true,
			},
			expectedError: {
				errorType: RouterliciousErrorTypes.clusterDrainingError,
				internalErrorCode: R11sServiceClusterDrainingErrorCode,
			},
		},
	];

	async function testConnectDocumentError(testCase: ErrorTestCase) {
		const errorEventName = "connect_document_error";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorEventName, errorToThrow: testCase.error },
		});

		await assert.rejects(
			mockSocket(socket as unknown as Socket, async () =>
				documentService.connectToDeltaStream(client),
			),
			{
				errorType: testCase.expectedError.errorType,
				scenarioName: "connect_document_error",
				internalErrorCode: testCase.expectedError.internalErrorCode,
			},
			"Error should have occurred",
		);
	}

	async function testSocketError(testCase: ErrorTestCase) {
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

		socket.sendErrorEvent(testCase.error);

		assert(
			error?.errorType === testCase.expectedError.errorType,
			`Error type should be ${testCase.expectedError.errorType}`,
		);
		assert(error.scenarioName === "error", "Error scenario name should be error");
		assert(
			(error as any).internalErrorCode === testCase.expectedError.internalErrorCode,
			`Error internal code should be ${testCase.expectedError.internalErrorCode}`,
		);
	}

	// Generate tests for each error case
	for (const testCase of errorTestCases) {
		it(`connect_document_error with ${testCase.name}`, async () => {
			await testConnectDocumentError(testCase);
		});

		it(`Socket error with ${testCase.name}`, async () => {
			await testSocketError(testCase);
		});
	}

	async function testDataError(
		errorConstructor: typeof DataCorruptionError | typeof DataProcessingError,
		expectedErrorType: string,
	) {
		const clientError = errorConstructor === DataCorruptionError
			? new DataCorruptionError("Data corruption error", { driverVersion: "1.0" })
			: DataProcessingError.create("Data processing error", "test", undefined, { driverVersion: "1.0" });

		const socketEventName = "connect_document_success";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: socketEventName },
		});

		const connection = await mockSocket(socket as unknown as Socket, async () =>
			documentService.connectToDeltaStream(client),
		);

		const disconnectEventP = new Promise<{
			clientId: string;
			errorType: string;
			isCorruption: boolean;
		}>((resolve) => {
			assert(socket !== undefined, "Socket should be defined");
			socket.on(
				"disconnect_document",
				(clientId: string, documentId: string, errorType: string, isCorruption: boolean) => {
					resolve({
						clientId,
						errorType,
						isCorruption,
					});
				},
			);
		});

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
		assert(
			disconnectResult.isCorruption,
			"isCorruption flag should be true",
		);
	}

	it("Socket error with Data Corruption error", async () => {
		await testDataError(DataCorruptionError, FluidErrorTypes.dataCorruptionError);
	});

	it("Socket error with Data Processing error", async () => {
		await testDataError(DataProcessingError, FluidErrorTypes.dataProcessingError);
	});
});
