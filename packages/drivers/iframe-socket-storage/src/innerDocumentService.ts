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
} from "@prague/protocol-definitions";
import { InnerDocumentDeltaConnection } from "@prague/socket-storage-shared";
import * as Comlink from "comlink";
import { InnerDocumentStorageService } from "./innerDocumentStorageService";
import { IOuterProxy } from "./outerDocumentService";

/**
 * The shell of the document Service that we'll use on the inside of an IFrame
 */
export class InnerDocumentService implements IDocumentService {
    /**
     * Create a new InnerDocumentService
     */
    public static async create(): Promise<InnerDocumentService> {

        return new Promise(async (resolve) => {
            const create = async () => {
                const outerProxyP = Comlink.wrap(Comlink.windowEndpoint(window.parent)) as Promise<IOuterProxy>;
                const outerProxy = await outerProxyP;
                await outerProxy.connected();
                return new InnerDocumentService(outerProxy);
            };
            const eventListener = async (evt) => {
                resolve(await create());
            };
            window.addEventListener("message", eventListener, {once: true});

            const docService = await create();
            window.removeEventListener("message", eventListener);
            resolve(docService);
        });
    }

    constructor(private readonly outerProxy: IOuterProxy) {
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new InnerDocumentStorageService(this.outerProxy);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return {
            get: this.outerProxy.get,
        };
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient, mode: ConnectionMode): Promise<IDocumentDeltaConnection> {
        const connection = await this.outerProxy.getDetails();
        return InnerDocumentDeltaConnection.create(connection, this.outerProxy);
    }

    public async branch(): Promise<string> {
        return Promise.reject(new Error("Inner Document Service: branch not implemented"));
    }

    public getErrorTrackingService() {
        throw new Error("Inner Document Service: getErrorTrackingService not implemented");
        return null;
    }
}
