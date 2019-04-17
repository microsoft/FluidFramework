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
        private readonly bypassSnapshot = false,
        ) {
    }

    public async connectToStorage(tenantId: string, id: string): Promise<api.IDocumentStorageService> {
        const documentManager = this.bypassSnapshot ?
            new NoopDocumentStorageManager() :
            new StandardDocumentStorageManager(id, this.snapshotUrl, this.tokenProvider);
        return new DocumentStorageService(documentManager);
    }

    public async connectToDeltaStorage(tenantId: string, id: string): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl);
        return new DocumentDeltaStorageService(tenantId, id, this.tokenProvider, deltaStorage);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return DocumentDeltaConnection.Create(tenantId, id, this.tokenProvider.socketToken, io, client, this.webSocketUrl);
    }

    public async branch(tenantId: string, id: string): Promise<string | null> {
        return null;
    }

    public getErrorTrackingService(): null {
        return null;
    }
}
