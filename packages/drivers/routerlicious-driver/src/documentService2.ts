/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaConnection, IResolvedUrl } from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";
import { ICredentials } from "@fluidframework/server-services-client";
import { DocumentService } from "./documentService";
import { ITokenProvider } from "./tokens";
import { WSDeltaConnection } from "./wsDeltaConnection";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService2 extends DocumentService {
    constructor(
        resolvedUrl: IResolvedUrl,
        ordererUrl: string,
        deltaStorageUrl: string,
        gitUrl: string,
        errorTracking: api.IErrorTrackingService,
        disableCache: boolean, historianApi: boolean,
        directCredentials: ICredentials | undefined,
        tokenProvider: ITokenProvider,
        tenantId: string,
        documentId: string) {
        super(
            resolvedUrl,
            ordererUrl,
            deltaStorageUrl,
            gitUrl,
            errorTracking,
            disableCache,
            historianApi,
            directCredentials,
            undefined,
            tokenProvider,
            tenantId,
            documentId);
    }

    /**
     * Connects to a delta stream endpoint of provided documentService so as to fire ops.
     *
     * @param client - Client that connects to socket.
     * @returns returns the delta stream service.
     */
    public async connectToDeltaStream(
        client: api.IClient): Promise<IDocumentDeltaConnection> {
        const ordererToken = await this.tokenProvider.fetchOrdererToken();
        return WSDeltaConnection.create(
            this.tenantId,
            this.documentId,
            ordererToken.jwt,
            client,
            this.ordererUrl);
    }
}
