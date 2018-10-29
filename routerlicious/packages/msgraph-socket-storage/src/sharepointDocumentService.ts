import * as api from "@prague/runtime-definitions";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import { DocumentDeltaStorageService, SharepointDeltaStorageService } from "./deltaStorageService";
import { ReplayDocumentStorageService } from "./sharepointDocumentStorageService";

export class SharepointDocumentService implements api.IDocumentService {
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
        token: string): Promise<api.IDocumentStorageService> {
        // Use the replaydocumentstorage service to return the default values for snapshot methods
        // Replace this once sharepoint starts supporting snapshots
        return new ReplayDocumentStorageService();
    }

    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new SharepointDeltaStorageService(this.deltaFeedUrl);
        return new DocumentDeltaStorageService(tenantId, id, token, deltaStorage);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        token: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {

        return DocumentDeltaConnection.Create(tenantId, id, token, io, client, this.webSocketUrl);
    }

    public async branch(tenantId: string, id: string, token: string): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
