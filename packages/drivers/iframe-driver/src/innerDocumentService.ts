/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { DocumentStorageServiceProxy } from "@fluidframework/driver-utils";
import { InnerDocumentDeltaConnection } from "./innerDocumentDeltaConnection";
import { ICombinedDriver } from "./outerDocumentServiceFactory";

/**
 * The shell of the document Service that we'll use on the inside of an IFrame
 */
export class InnerDocumentService implements IDocumentService {
    /**
     * Create a new InnerDocumentService
     */
    public static async create(proxyObject: ICombinedDriver): Promise<InnerDocumentService> {
        return new InnerDocumentService(proxyObject, proxyObject.clientId);
    }

    private constructor(
        private readonly outerProxy: ICombinedDriver,
        public clientId: string) { }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public get resolvedUrl(): IResolvedUrl {
        throw new Error("Not implemented");
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new DocumentStorageServiceProxy(this.outerProxy.storage as unknown as IDocumentStorageService);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return {
            get: async (from?: number, to?: number) => this.outerProxy.deltaStorage.get(from, to),
        };
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        const stream = this.outerProxy.stream;
        const connection = await stream.getDetails();
        return InnerDocumentDeltaConnection.create(connection, stream);
    }

    public async branch(): Promise<string> {
        return Promise.reject(new Error("Inner Document Service: branch not implemented"));
    }

    public getErrorTrackingService() {
        throw new Error("Inner Document Service: getErrorTrackingService not implemented");
        return null;
    }
}
