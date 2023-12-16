/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentServicePolicies,
	IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { DefaultTokenProvider } from "@fluidframework/routerlicious-driver";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { ISummaryTree, NackErrorType } from "@fluidframework/protocol-definitions";
import { LocalDocumentDeltaConnection } from "./localDocumentDeltaConnection";
import { createLocalDocumentService } from "./localDocumentService";
import { createDocument } from "./localCreateDocument";

/**
 * Implementation of document service factory for local use.
 * @alpha
 */
export class LocalDocumentServiceFactory implements IDocumentServiceFactory {
	// A map of clientId to LocalDocumentService.
	private readonly documentDeltaConnectionsMap: Map<string, LocalDocumentDeltaConnection> =
		new Map();

	/**
	 * @param localDeltaConnectionServer - delta connection server for ops
	 * @alpha
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
		const parsedUrl = parse(resolvedUrl.url);
		const [, tenantId, documentId] = parsedUrl.path ? parsedUrl.path.split("/") : [];
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
