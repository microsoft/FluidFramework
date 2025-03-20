/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IClient } from "@fluidframework/driver-definitions";
import {
	IDocumentServiceEvents,
	IDocumentService,
	IResolvedUrl,
	IDocumentStorageService,
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
} from "@fluidframework/driver-definitions/internal";

import { FileDeltaStorageService } from "./fileDeltaStorageService.js";

/**
 * The DocumentService manages the different endpoints for connecting to
 * underlying storage for file document service.
 */
export class FileDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly storage: IDocumentStorageService,
		private readonly deltaStorage: FileDeltaStorageService,
		private readonly deltaConnection: IDocumentDeltaConnection,
	) {
		super();
	}

	public dispose() {}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		return this.storage;
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return this.deltaStorage;
	}

	/**
	 * Connects to a delta storage endpoint of provided documentService to get ops and then replaying
	 * them so as to mimic a delta stream endpoint.
	 *
	 * @param client - Client that connects to socket.
	 * @returns returns the delta stream service.
	 */
	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		return this.deltaConnection;
	}
}
