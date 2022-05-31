/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import {
    IClient,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
    MockDocumentDeltaStorageService,
} from "./mockDeltaStorage";
import { MockDocumentDeltaConnection } from "./mockDocumentDeltaConnection";

/**
 * Mock Document Service for testing
 */
export class MockDocumentService implements IDocumentService {
    public get deltaStorageMessages() { return this._deltaStorageMessages; }

    private nextClientId: number = 0;

    private readonly _deltaStorageMessages: ISequencedDocumentMessage[] = [];

    constructor(
        private readonly deltaStorageFactory?: () => IDocumentDeltaStorageService,
        private readonly deltaConnectionFactory?: (client?: IClient) => IDocumentDeltaConnection,
    ) { }

    public dispose() {}

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public get resolvedUrl(): IResolvedUrl {
        throw new Error("Not implemented");
    }

    public async connectToStorage(): Promise<IDocumentStorageService> {
        throw new Error("Method not implemented.");
    }
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return this.deltaStorageFactory !== undefined
            ? this.deltaStorageFactory()
            : new MockDocumentDeltaStorageService(this.deltaStorageMessages);
    }
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        return this.deltaConnectionFactory !== undefined
            ? this.deltaConnectionFactory(client)
            : new MockDocumentDeltaConnection(`mock_client_${this.nextClientId++}`);
    }
}
