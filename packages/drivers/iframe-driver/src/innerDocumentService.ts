/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { DocumentStorageServiceProxy } from "@fluidframework/driver-utils";
import { IClient } from "@fluidframework/protocol-definitions";
import { MultiSinkLogger } from "@fluidframework/telemetry-utils";
import { InnerDocumentDeltaConnection } from "./innerDocumentDeltaConnection";
import { ICombinedDriver } from "./outerDocumentServiceFactory";

/**
 * The shell of the document Service that we'll use on the inside of an IFrame
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export class InnerDocumentService implements IDocumentService {
    /**
     * Create a new InnerDocumentService
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public static async create(
        proxyObject: ICombinedDriver,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<InnerDocumentService> {
        return new InnerDocumentService(
            proxyObject,
            resolvedUrl,
            proxyObject.clientId,
            logger,
        );
    }

    private readonly logger: MultiSinkLogger;

    private constructor(
        private readonly outerProxy: ICombinedDriver,
        /**
         * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming
         * release
         */
        public readonly resolvedUrl: IResolvedUrl,
        /**
         * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming
         * release
         */
        public clientId: string,
        logger?: ITelemetryBaseLogger) {
        // Use a combined logger with the provided and the outer proxy's
        this.logger = new MultiSinkLogger("InnerIFrameDriver");
        this.logger.addLogger(logger);
        this.logger.addLogger(outerProxy.logger);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public dispose() {}

    /**
     * Connects to a storage endpoint for snapshot service.
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new DocumentStorageServiceProxy(this.outerProxy.storage as unknown as IDocumentStorageService);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return {
            fetchMessages: (...args) => this.outerProxy.deltaStorage.fetchMessages(...args),
        };
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        const stream = this.outerProxy.stream;
        const connection = await stream.getDetails();
        return InnerDocumentDeltaConnection.create(connection, stream);
    }
}
