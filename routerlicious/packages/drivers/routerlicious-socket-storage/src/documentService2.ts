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
        deltaUrl: string,
        gitUrl: string,
        errorTracking: api.IErrorTrackingService,
        disableCache: boolean, historianApi: boolean,
        directCredentials: ICredentials,
        tenantId: string,
        documentId: string) {
        super(
            deltaUrl,
            gitUrl,
            errorTracking,
            disableCache,
            historianApi,
            directCredentials,
            null,
            tenantId,
            documentId);
    }
    public async connectToDeltaStream(
        tokenProvider: api.ITokenProvider,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const token = (tokenProvider as TokenProvider).token;
        return WSDeltaConnection.Create(this.tenantId, this.documentId, token, client, this.deltaUrl);
    }
}
