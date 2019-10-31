/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ConnectionMode,
    IClient,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
} from "@microsoft/fluid-protocol-definitions";
import { InnerDocumentDeltaConnection } from "./innerDocumentDeltaConnection";
import { InnerDocumentStorageService } from "./innerDocumentStorageService";
import { ICombinedDrivers } from "./outerDocumentServiceFactory";

/**
 * The shell of the document Service that we'll use on the inside of an IFrame
 */
export class InnerDocumentService implements IDocumentService {
    /**
     * Create a new InnerDocumentService
     */
    public static async create(proxyObject: ICombinedDrivers): Promise<InnerDocumentService> {
        // tslint:disable-next-line: await-promise
        return new InnerDocumentService(proxyObject, await proxyObject.clientId);
    }

    constructor(private readonly outerProxy: ICombinedDrivers, public clientId: string) {
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new InnerDocumentStorageService(this.outerProxy.storage);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return {
            get: (from?: number, to?: number) => {
                return this.outerProxy.deltaStorage.get(from, to);
            },
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
