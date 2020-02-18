/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
} from "@microsoft/fluid-driver-definitions";
import {
    IClient,
    IErrorTrackingService,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
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
        private readonly deltaConnectionFactory?: () => IDocumentDeltaConnection,
    ) {}

    public async connectToStorage(): Promise<IDocumentStorageService> {
        throw new Error("Method not implemented.");
    }
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return this.deltaStorageFactory
            ? this.deltaStorageFactory()
            : new MockDocumentDeltaStorageService(this.deltaStorageMessages);
    }
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        return this.deltaConnectionFactory
            ? this.deltaConnectionFactory()
            : new MockDocumentDeltaConnection(`mock_client_${this.nextClientId++}`);
    }
    public async branch(): Promise<string> {
        throw new Error("Method not implemented.");
    }
    public getErrorTrackingService(): IErrorTrackingService {
        throw new Error("Method not implemented.");
    }
}
