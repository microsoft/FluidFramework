/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IFluidResolvedUrl,
} from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { FileDeltaStorageService } from "./fileDeltaStorageService";

/**
 * The DocumentService manages the different endpoints for connecting to
 * underlying storage for file document service.
 */
export class FileDocumentService implements IDocumentService {
    constructor(
        private readonly storage: IDocumentStorageService,
        private readonly deltaStorage: FileDeltaStorageService,
        private readonly deltaConnection: IDocumentDeltaConnection,
        public readonly resolvedUrl: IFluidResolvedUrl,
    ) {
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
     * @param _client - Client that connects to socket.
     * @returns returns the delta stream service.
     */
    public async connectToDeltaStream(_client: IClient): Promise<IDocumentDeltaConnection> {
        return this.deltaConnection;
    }
}
