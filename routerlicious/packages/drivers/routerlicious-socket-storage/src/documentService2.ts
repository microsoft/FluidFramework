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
        tokenProvider: TokenProvider) {
        super(
            ordererUrl,
            deltaStorageUrl,
            gitUrl,
            errorTracking,
            disableCache,
            historianApi,
            directCredentials,
            null,
            tokenProvider);
    }
    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return WSDeltaConnection.Create(tenantId, id, this.tokenProvider.token, client, this.ordererUrl);
    }
}
