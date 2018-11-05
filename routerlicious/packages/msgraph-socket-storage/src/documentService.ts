import * as api from "@prague/runtime-definitions";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import * as io from "socket.io-client";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentStorageService } from "./documentStorageService";
import { TokenProvider } from "./token";

export class DocumentService implements api.IDocumentService {
    constructor(
        private snapshotUrl: string,
        private deltaFeedUrl: string,
        private webSocketUrl: string) {
        // For now just log the snapshot url until sharepoint starts supporting snapshots
        console.log(this.snapshotUrl);
    }

    public async connectToStorage(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentStorageService> {
        // Use the replaydocumentstorage service to return the default values for snapshot methods
        // Replace this once sharepoint starts supporting snapshots
        return new DocumentStorageService();
    }

    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaFeedUrl);
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
