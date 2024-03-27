/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import * as api from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { EmptyDeltaStorageService } from "./emptyDeltaStorageService.js";
import { ReplayController } from "./replayController.js";
import { ReplayDocumentDeltaConnection } from "./replayDocumentDeltaConnection.js";

/**
 * The Replay document service dummies out the snapshot and the delta storage.
 * Delta connection simulates the socket by fetching the ops from delta storage
 * and emitting them with a pre determined delay
 * @internal
 */
// eslint-disable-next-line import/namespace
export class ReplayDocumentService
	extends TypedEventEmitter<api.IDocumentServiceEvents>
	implements api.IDocumentService
{
	public static async create(
		documentService: api.IDocumentService,
		controller: ReplayController,
	): Promise<api.IDocumentService> {
		const useController = await controller.initStorage(documentService);
		if (!useController) {
			return documentService;
		}

		const deltaConnection = ReplayDocumentDeltaConnection.create(
			await documentService.connectToDeltaStorage(),
			controller,
		);
		return new ReplayDocumentService(controller, deltaConnection);
	}

	constructor(
		private readonly controller: api.IDocumentStorageService,
		private readonly deltaStorage: api.IDocumentDeltaConnection,
	) {
		super();
	}

	public dispose() {}

	// TODO: Issue-2109 Implement detach container api or put appropriate comment.
	public get resolvedUrl(): api.IResolvedUrl {
		throw new Error("Not implemented");
	}

	/**
	 * Connects to a storage endpoint for snapshot service and blobs.
	 * @returns returns the dummy document storage service for replay driver.
	 */
	public async connectToStorage(): Promise<api.IDocumentStorageService> {
		return this.controller;
	}

	/**
	 * Connects to a delta storage endpoint for getting ops between a range.
	 * @returns returns the dummy document delta storage service for replay driver.
	 */
	public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
		return new EmptyDeltaStorageService();
	}

	/**
	 * Connects to a delta storage endpoint of provided documentService to get ops and then replaying
	 * them so as to mimic a delta stream endpoint.
	 * @param client - Client that connects to socket.
	 * @returns returns the delta stream service which replay ops from --from to --to arguments.
	 */
	public async connectToDeltaStream(client: IClient): Promise<api.IDocumentDeltaConnection> {
		return this.deltaStorage;
	}
}
