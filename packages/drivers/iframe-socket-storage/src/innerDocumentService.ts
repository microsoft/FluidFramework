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
import { ConnectionMode, IClient } from "@microsoft/fluid-protocol-definitions";
import { DocumentStorageServiceProxy } from "@microsoft/fluid-driver-utils";
import { InnerDocumentDeltaConnection, IOuterDocumentDeltaConnectionProxy } from "./innerDocumentDeltaConnection";

/**
 * The shell of the document Service that we'll use on the inside of an IFrame
 */
export class InnerDocumentService implements IDocumentService {
    /**
     * Create a new InnerDocumentService
     */
    public static async create(proxyObject: {
        clientId: string,
        stream: IOuterDocumentDeltaConnectionProxy,
        deltaStorage: IDocumentDeltaStorageService,
        storage: IDocumentStorageService,
    }): Promise<InnerDocumentService> {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        return new InnerDocumentService(proxyObject, await proxyObject.clientId);
    }

    constructor(private readonly outerProxy: {
        clientId: string,
        stream: IOuterDocumentDeltaConnectionProxy,
        deltaStorage: IDocumentDeltaStorageService,
        storage: IDocumentStorageService
    },
        // eslint-disable-next-line @typescript-eslint/indent
        public clientId: string) { }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new DocumentStorageServiceProxy(this.outerProxy.storage);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return {
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            get: (from?: number, to?: number) => this.outerProxy.deltaStorage.get(from, to),
        };
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient, mode: ConnectionMode): Promise<IDocumentDeltaConnection> {
        const connection = await this.outerProxy.stream.getDetails();
        return InnerDocumentDeltaConnection.create(connection, this.outerProxy.stream);
    }

    public async branch(): Promise<string> {
        return Promise.reject(new Error("Inner Document Service: branch not implemented"));
    }

    public getErrorTrackingService() {
        throw new Error("Inner Document Service: getErrorTrackingService not implemented");
        return null;
    }
}
