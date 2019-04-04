import * as api from "@prague/container-definitions";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import * as io from "socket.io-client";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentStorageService } from "./documentStorageService";
import { NoopDocumentStorageManager } from "./noopDocumentStorageManager";
import { StandardDocumentStorageManager } from "./standardDocumentStorageManager";
import { TokenProvider } from "./token";

export class DocumentService implements api.IDocumentService {
    constructor(
        private readonly snapshotUrl: string,
        private readonly deltaStorageUrl: string,
        private readonly webSocketUrl: string,
        private readonly bypassSnapshot = false,
        ) {
    }

    public async createTokenProvider(tokens: { [name: string]: string }): Promise<api.ITokenProvider> {
        return new TokenProvider(tokens.storageToken, tokens.socketToken);
    }

    public async connectToStorage(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentStorageService> {
        const documentManager = this.bypassSnapshot ?
            new NoopDocumentStorageManager() :
            new StandardDocumentStorageManager(id, this.snapshotUrl, tokenProvider);
        return new DocumentStorageService(documentManager);
    }

    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl);
        return new DocumentDeltaStorageService(tenantId, id, tokenProvider, deltaStorage);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const token = (tokenProvider as TokenProvider).socketToken;
        return DocumentDeltaConnection.Create(tenantId, id, token, io, client, this.webSocketUrl);
    }

    public async branch(tenantId: string, id: string, tokenProvider: api.ITokenProvider): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
