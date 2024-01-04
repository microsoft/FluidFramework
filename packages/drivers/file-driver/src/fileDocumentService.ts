/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { FileDeltaStorageService } from "./fileDeltaStorageService";

/**
 * The DocumentService manages the different endpoints for connecting to
 * underlying storage for file document service.
 */
// eslint-disable-next-line import/namespace
export class FileDocumentService implements api.IDocumentService {
	constructor(
		public readonly resolvedUrl: api.IResolvedUrl,
		private readonly storage: api.IDocumentStorageService,
		private readonly deltaStorage: FileDeltaStorageService,
		private readonly deltaConnection: api.IDocumentDeltaConnection,
	) {}

	public dispose() {}

	public async connectToStorage(): Promise<api.IDocumentStorageService> {
		return this.storage;
	}

	public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
		return this.deltaStorage;
	}

	/**
	 * Connects to a delta storage endpoint of provided documentService to get ops and then replaying
	 * them so as to mimic a delta stream endpoint.
	 *
	 * @param client - Client that connects to socket.
	 * @returns returns the delta stream service.
	 */
	public async connectToDeltaStream(client: IClient): Promise<api.IDocumentDeltaConnection> {
		return this.deltaConnection;
	}
}
