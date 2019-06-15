import * as api from "@prague/container-definitions";
import { ICredentials } from "@prague/services-client";
import { DocumentService } from "./documentService";
import { TokenProvider } from "./tokens";
import { WSDeltaConnection } from "./wsDeltaConnection";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService2 extends DocumentService {
    constructor(
        ordererUrl: string,
        deltaStorageUrl: string,
        gitUrl: string,
        errorTracking: api.IErrorTrackingService,
        disableCache: boolean, historianApi: boolean,
        directCredentials: ICredentials | undefined,
        tokenProvider: TokenProvider,
        tenantId: string,
        documentId: string) {
        super(
            ordererUrl,
            deltaStorageUrl,
            gitUrl,
            errorTracking,
            disableCache,
            historianApi,
            directCredentials,
            null,
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
    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return WSDeltaConnection.create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            client,
            this.ordererUrl);
    }
}
