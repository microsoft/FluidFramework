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
import { isFluidError } from "@fluidframework/telemetry-utils/internal";
import { stub } from "sinon";
import type { Socket } from "socket.io-client";

import { R11sServiceClusterDrainingErrorCode } from "../contracts.js";
import { DefaultTokenProvider } from "../defaultTokenProvider.js";
import { DocumentService } from "../documentService.js";
import { RouterliciousDocumentServiceFactory } from "../documentServiceFactory.js";
import { RouterliciousErrorTypes } from "../errorUtils.js";
import * as socketModule from "../socketModule.js";

// eslint-disable-next-line import/no-internal-modules
import { ClientSocketMock } from "./socketTestUtils.ts/socketMock.js";

/**
 * Encapsulates the logic for mocking the socket.io-client creation.
 * @param _response - The mock ClientSocketMock instance to return when SocketIOClient is called
 * @param callback - The async function to execute while the socket creation is mocked
 * @returns The result of the callback function
 */
async function mockSocket<T>(
	_response: ClientSocketMock,
	callback: () => Promise<T>,
): Promise<T> {
	const getSocketCreationStub = stub(socketModule, "SocketIOClientStatic");
	// Cast needed because ClientSocketMock doesn't implement the full Socket interface,
	// but provides the minimal functionality needed for our tests
	getSocketCreationStub.returns(_response as unknown as Socket);
	try {
		return await callback();
	} finally {
		getSocketCreationStub.restore();
	}
}

describe("Routerlicious Socket Error Handling", () => {
	let documentService: DocumentService;
	let routerliciousDocumentServiceFactory: RouterliciousDocumentServiceFactory;
	let resolvedUrl: IResolvedUrl;

	const client: IClient = {
		mode: "read",
		details: { capabilities: { interactive: true } },
		permission: [],
		user: { id: "id" },
		scopes: [],
	};

	/**
	 * Defines the structure for error test scenarios.
	 */
	interface IErrorScenario {
		/** Display name for the error scenario */
		name: string;
		/** The error object to throw during testing */
		errorToThrow: {
			/** HTTP status code for the error */
			code: number;
			/** Error message text */
			message: string;
			/** Time in milliseconds to retry after the error (optional) */
			retryAfterMs?: number;
			/** Internal error code identifier */
			internalErrorCode: string;
			/** Type of driver error */
			errorType: string;
			/** Whether the error can be retried */
			canRetry: boolean;
		};
		/** Expected error type in test assertions */
		expectedErrorType: string;
		/** Expected internal error code in test assertions */
		expectedInternalErrorCode: string;
	}

	// Defines error scenarios in a structured way to avoid test code repetition.
	const errorScenarios = [
		{
			name: "Token Revoked",
			errorToThrow: {
				code: 403,
				message: "TokenRevokedError",
				internalErrorCode: "TokenRevoked",
				errorType: DriverErrorTypes.authorizationError,
				canRetry: false,
			},
			expectedErrorType: DriverErrorTypes.authorizationError,
			expectedInternalErrorCode: "TokenRevoked",
		},
		{
			name: "Cluster Draining",
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
	] as const satisfies IErrorScenario[];

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

	describe("on 'connect_document_error'", () => {
		errorScenarios.forEach((scenario) => {
			it(`when ${scenario.name} error occurs, connectToDeltaStream rejects with ${scenario.expectedErrorType}`, async () => {
				const socket = new ClientSocketMock({
					connect_document: {
						eventToEmit: "connect_document_error",
						errorToThrow: scenario.errorToThrow,
					},
				});

				await assert.rejects(
					mockSocket(socket, async () => documentService.connectToDeltaStream(client)),
					{
						errorType: scenario.expectedErrorType,
						scenarioName: "connect_document_error",
						internalErrorCode: scenario.expectedInternalErrorCode,
					},
					"Connection should have been rejected with the correct error details.",
				);
			});
		});
	});

	describe("on post-connection 'error' event", () => {
		errorScenarios.forEach((scenario) => {
			it(`when ${scenario.name} error occurs after connection, emits disconnect event with ${scenario.expectedErrorType}`, async () => {
				const socket = new ClientSocketMock({
					connect_document: { eventToEmit: "connect_document_success" },
				});

				const connection = await mockSocket(socket, async () =>
					documentService.connectToDeltaStream(client),
				);

				// Use a promise to deterministically wait for the "disconnect" event.
				const disconnectPromise = new Promise<IAnyDriverError | undefined>((resolve) => {
					connection.on("disconnect", resolve);
				});

				socket.sendErrorEvent(scenario.errorToThrow);
				const error = await disconnectPromise;

				assert.ok(error, "A disconnect reason should have been provided.");
				assert.strictEqual(
					error.errorType,
					scenario.expectedErrorType,
					`Error type should be ${scenario.expectedErrorType}`,
				);
				assert.strictEqual(error.scenarioName, "error", "Scenario name should be 'error'");

				const telemetryProps = isFluidError(error) ? error.getTelemetryProperties() : {};
				assert.strictEqual(
					telemetryProps.internalErrorCode,
					scenario.expectedInternalErrorCode,
					`Internal error code should be ${scenario.expectedInternalErrorCode}`,
				);
			});
		});
	});
});
