import * as api from "@prague/container-definitions";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";
import { TestDeltaStorageService } from "./testDeltaStorageService";
import { TestDocumentDeltaConnection } from "./testDocumentDeltaConnection";
import { TestDocumentStorageService } from "./testDocumentStorageService";

/**
 */
export class TestDocumentService implements api.IDocumentService {
    constructor(
        private testDeltaConnectionServer: ITestDeltaConnectionServer,
        private tokenProvider: socketStorage.TokenProvider,
        private tenantId: string,
        private documentId: string,
    ) {}

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new TestDeltaStorageService(
            this.tenantId,
            this.documentId,
            this.testDeltaConnectionServer.databaseManager);
    }

    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return TestDocumentDeltaConnection.Create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            client,
            this.testDeltaConnectionServer.webSocketServer);
    }

    public async branch(): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
