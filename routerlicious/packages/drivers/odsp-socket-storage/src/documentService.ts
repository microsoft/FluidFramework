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
        private readonly tenantId?: string,
        private readonly documentId?: string) {
    }

    public async createTokenProvider(tokens: { [name: string]: string }): Promise<api.ITokenProvider> {
        return new TokenProvider(tokens.storageToken, tokens.socketToken);
    }

    public async connectToStorage(
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentStorageService> {
        const documentManager = this.snapshotUrl ?
            new StandardDocumentStorageManager(this.snapshotUrl, tokenProvider) :
            new NoopDocumentStorageManager();
        return new DocumentStorageService(documentManager);
    }

    public async connectToDeltaStorage(
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl);
        return new DocumentDeltaStorageService(this.tenantId, this.documentId, tokenProvider, deltaStorage);
    }

    public async connectToDeltaStream(
        tokenProvider: api.ITokenProvider,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const token = (tokenProvider as TokenProvider).socketToken;
        return DocumentDeltaConnection.Create(this.tenantId, this.documentId, token, io, client, this.webSocketUrl);
    }

    public async branch(tokenProvider: api.ITokenProvider): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
