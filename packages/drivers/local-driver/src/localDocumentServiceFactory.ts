/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentServicePolicies,
	IResolvedUrl,
	NackErrorType,
} from "@fluidframework/driver-definitions/internal";
import { DefaultTokenProvider } from "@fluidframework/routerlicious-driver/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import { createDocument } from "./localCreateDocument.js";
import { LocalDocumentDeltaConnection } from "./localDocumentDeltaConnection.js";
import { createLocalDocumentService } from "./localDocumentService.js";

// eslint-disable-next-line @typescript-eslint/unbound-method
const originalClose = LocalDeltaConnectionServer.prototype.close;
LocalDeltaConnectionServer.prototype.close = async function () {
	(
		this.webSocketServer as unknown as {
			events: { emit: (event: "disconnect") => void };
		}
	).events.emit("disconnect");
	return originalClose.bind(this)();
};

/**
 * Implementation of document service factory for local use.
 * @legacy
 * @alpha
 */
export class LocalDocumentServiceFactory implements IDocumentServiceFactory {
	// A map of clientId to LocalDocumentService.
	private readonly documentDeltaConnectionsMap: Map<string, LocalDocumentDeltaConnection> =
		new Map();

	/**
	 * @param localDeltaConnectionServer - delta connection server for ops
	 */
	constructor(
		private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer,
		private readonly policies?: IDocumentServicePolicies,
		private readonly innerDocumentService?: IDocumentService,
	) {}

	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		if (!this.localDeltaConnectionServer) {
			throw new Error("Provide the localDeltaConnectionServer!!");
		}
		if (createNewSummary !== undefined) {
			await createDocument(this.localDeltaConnectionServer, resolvedUrl, createNewSummary);
		}
		return this.createDocumentService(resolvedUrl, logger, clientIsSummarizer);
	}

	/**
	 * Creates and returns a document service for testing using the given resolved
	 * URL for the tenant ID, document ID, and token.
	 * @param resolvedUrl - resolved URL of document
	 */
	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const parsedUrl = new URL(resolvedUrl.url);
		const [, tenantId, documentId] = parsedUrl.pathname ? parsedUrl.pathname.split("/") : [];
		if (!documentId || !tenantId) {
			throw new Error(
				`Couldn't parse resolved url. [documentId:${documentId}][tenantId:${tenantId}]`,
			);
		}

		const fluidResolvedUrl = resolvedUrl;
		const jwtToken = fluidResolvedUrl.tokens.jwt;
		if (!jwtToken) {
			throw new Error(`Token was not provided.`);
		}

		const tokenProvider = new DefaultTokenProvider(jwtToken);

		return createLocalDocumentService(
			resolvedUrl,
			this.localDeltaConnectionServer,
			tokenProvider,
			tenantId,
			documentId,
			this.documentDeltaConnectionsMap,
			this.policies,
			this.innerDocumentService,
			logger,
		);
	}

	/**
	 * Gets the document delta connection for the clientId and asks it to disconnect the client.
	 * @param clientId - The ID of the client to be disconnected.
	 * @param disconnectReason - The reason of the disconnection.
	 */
	public disconnectClient(clientId: string, disconnectReason: string) {
		const documentDeltaConnection = this.documentDeltaConnectionsMap.get(clientId);
		if (documentDeltaConnection === undefined) {
			throw new Error(`No client with the id: ${clientId}`);
		}
		documentDeltaConnection.disconnectClient(disconnectReason);
	}

	/**
	 * Gets the document delta connection for the clientId and asks it to nack the client.
	 * @param clientId - The ID of the client to be Nack'd.
	 * @param code - An error code number that represents the error. It will be a valid HTTP error code.
	 * @param type - Type of the Nack.
	 * @param message - A message about the nack for debugging/logging/telemetry purposes.
	 */
	public nackClient(clientId: string, code?: number, type?: NackErrorType, message?: any) {
		const documentDeltaConnection = this.documentDeltaConnectionsMap.get(clientId);
		if (documentDeltaConnection === undefined) {
			throw new Error(`No client with the id: ${clientId}`);
		}
		documentDeltaConnection.nackClient(code, type, message);
	}
}
