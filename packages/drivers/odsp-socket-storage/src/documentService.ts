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
        private readonly tokenProvider: TokenProvider,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly bypassSnapshot = false,
        ) {
    }

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        const documentManager = this.bypassSnapshot ?
            new NoopDocumentStorageManager() :
            new StandardDocumentStorageManager(this.documentId, this.snapshotUrl, this.tokenProvider);
        return new DocumentStorageService(documentManager);
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl);
        return new DocumentDeltaStorageService(this.tenantId, this.documentId, this.tokenProvider, deltaStorage);
    }

    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return DocumentDeltaConnection.Create(this.tenantId, this.documentId, this.tokenProvider.socketToken, io, client, this.webSocketUrl);
    }

    public async branch(): Promise<string | null> {
        return null;
    }

    public getErrorTrackingService(): null {
        return null;
    }
}
