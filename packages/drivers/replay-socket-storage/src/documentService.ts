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

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new ReplayDocumentStorageService();
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new ReplayDeltaStorageService();
    }

    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const documentDeltaStorageService: api.IDocumentDeltaStorageService =
            await this.documentService.connectToDeltaStorage();
        return ReplayDocumentDeltaConnection.Create(
            documentDeltaStorageService,
            this.replayFrom,
            this.replayTo,
            this.unitIsTime);
    }

    public async branch(): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public getErrorTrackingService() {
        return null;
    }
}
