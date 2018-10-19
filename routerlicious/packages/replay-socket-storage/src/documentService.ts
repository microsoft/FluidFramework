import * as api from "@prague/runtime-definitions";
import { DeltaStorageService, ReplayDeltaStorageService } from "./deltaStorageService";
import { ReplayDocumentDeltaConnection } from "./documentDeltaConnection";
import { ReplayDocumentStorageService } from "./replayDocumentStorageService";

/**
 * The Replay document service dummies out the snapshot and the delta storage.
 * Delta connection simulates the socket by fetching the ops from delta storage
 * and emitting them with a pre determined delay
 */
export class ReplayDocumentService implements api.IDocumentService {
    private deltaStorage: DeltaStorageService;
    constructor(private deltaUrl: string,
                private replayFrom: number,
                private replayTo: number) {
        this.deltaStorage = new DeltaStorageService(this.deltaUrl);
    }
    public async connectToStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentStorageService> {

        return new ReplayDocumentStorageService();
    }
    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaStorageService> {

        return new ReplayDeltaStorageService();
    }
    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        token: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return ReplayDocumentDeltaConnection.Create(tenantId, id, token, this.deltaStorage,
             this.replayFrom, this.replayTo);
    }
    public async branch(tenantId: string, id: string, token: string): Promise<string> {
        return null;
    }
    public getErrorTrackingService() {
        return null;
    }
}
