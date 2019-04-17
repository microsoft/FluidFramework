import * as api from "@prague/container-definitions";
import { ReplayDeltaStorageService } from "./deltaStorageService";
import { ReplayDocumentDeltaConnection } from "./documentDeltaConnection";
import { ReplayDocumentStorageService } from "./replayDocumentStorageService";

/**
 * The Replay document service dummies out the snapshot and the delta storage.
 * Delta connection simulates the socket by fetching the ops from delta storage
 * and emitting them with a pre determined delay
 */
export class ReplayDocumentService implements api.IDocumentService {
    constructor(private replayFrom: number,
                private replayTo: number,
                private documentService: api.IDocumentService,
                private unitIsTime: boolean | undefined) {
    }

    public async connectToStorage(
        tenantId: string,
        id: string): Promise<api.IDocumentStorageService> {

        return new ReplayDocumentStorageService();
    }
    public async connectToDeltaStorage(
        tenantId: string,
        id: string): Promise<api.IDocumentDeltaStorageService> {

        return new ReplayDeltaStorageService();
    }
    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {

        const documentDeltaStorageService: api.IDocumentDeltaStorageService =
            await this.documentService.connectToDeltaStorage(tenantId, id);
        return ReplayDocumentDeltaConnection.Create(tenantId, id, documentDeltaStorageService,
            this.replayFrom, this.replayTo, this.unitIsTime);
    }
    public async branch(tenantId: string, id: string): Promise<string | null> {
        return null;
    }
    public getErrorTrackingService() {
        return null;
    }
}
