/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServicePolicies,
	IDocumentStorageService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITokenProvider } from "@fluidframework/routerlicious-driver";
import { GitManager } from "@fluidframework/server-services-client";
import { TestHistorian } from "@fluidframework/server-test-utils";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { LocalDocumentStorageService } from "./localDocumentStorageService.js";
import { LocalDocumentDeltaConnection } from "./localDocumentDeltaConnection.js";
import { LocalDeltaStorageService } from "./localDeltaStorageService.js";

/**
 * Basic implementation of a document service for local use.
 * @internal
 */
export class LocalDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	/**
	 * @param localDeltaConnectionServer - delta connection server for ops
	 * @param tokenProvider - token provider
	 * @param tenantId - ID of tenant
	 * @param documentId - ID of document
	 */
	constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer,
		private readonly tokenProvider: ITokenProvider,
		private readonly tenantId: string,
		private readonly documentId: string,
		private readonly documentDeltaConnectionsMap: Map<string, LocalDocumentDeltaConnection>,
		public readonly policies: IDocumentServicePolicies = { supportGetSnapshotApi: true },
		private readonly innerDocumentService?: IDocumentService,
		private readonly logger?: ITelemetryBaseLogger,
	) {
		super();
	}

	public dispose() {}

	/**
	 * Creates and returns a document storage service for local use.
	 */
	public async connectToStorage(): Promise<IDocumentStorageService> {
		return new LocalDocumentStorageService(
			this.documentId,
			new GitManager(
				new TestHistorian(this.localDeltaConnectionServer.testDbFactory.testDatabase),
			),
			{
				maximumCacheDurationMs: 432_000_000, // 5 days in ms. Not actually enforced but shouldn't matter for any local driver scenario
			},
			this.localDeltaConnectionServer,
			this.resolvedUrl,
		);
	}

	/**
	 * Creates and returns a delta storage service for local use.
	 */
	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		if (this.innerDocumentService) {
			return this.innerDocumentService.connectToDeltaStorage();
		}
		return new LocalDeltaStorageService(
			this.tenantId,
			this.documentId,
			this.localDeltaConnectionServer.databaseManager,
		);
	}

	/**
	 * Creates and returns a delta stream for local use.
	 * @param client - client data
	 */
	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		if (this.policies.storageOnly === true) {
			throw new Error("can't connect to delta stream in storage-only mode");
		}
		if (this.innerDocumentService) {
			return this.innerDocumentService.connectToDeltaStream(client);
		}
		const ordererToken = await this.tokenProvider.fetchOrdererToken(
			this.tenantId,
			this.documentId,
		);
		const documentDeltaConnection = await LocalDocumentDeltaConnection.create(
			this.tenantId,
			this.documentId,
			ordererToken.jwt,
			client,
			this.localDeltaConnectionServer.webSocketServer,
			undefined,
			this.logger,
		);
		const clientId = documentDeltaConnection.clientId;

		// Add this document service for the clientId in the document service factory.
		this.documentDeltaConnectionsMap.set(clientId, documentDeltaConnection);

		// Add a listener to remove this document service when the client is disconnected.
		documentDeltaConnection.on("disconnect", () => {
			this.documentDeltaConnectionsMap.delete(clientId);
		});

		return documentDeltaConnection;
	}
}

/**
 * Creates and returns a document service for local use.
 * @param localDeltaConnectionServer - delta connection server for ops
 * @param tokenProvider - token provider with a single token
 * @param tenantId - ID of tenant
 * @param documentId - ID of document
 * @internal
 */
export function createLocalDocumentService(
	resolvedUrl: IResolvedUrl,
	localDeltaConnectionServer: ILocalDeltaConnectionServer,
	tokenProvider: ITokenProvider,
	tenantId: string,
	documentId: string,
	documentDeltaConnectionsMap: Map<string, LocalDocumentDeltaConnection>,
	policies?: IDocumentServicePolicies,
	innerDocumentService?: IDocumentService,
	logger?: ITelemetryBaseLogger,
): IDocumentService {
	return new LocalDocumentService(
		resolvedUrl,
		localDeltaConnectionServer,
		tokenProvider,
		tenantId,
		documentId,
		documentDeltaConnectionsMap,
		policies,
		innerDocumentService,
		logger,
	);
}
