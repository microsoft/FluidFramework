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
    ) {}

    public async connectToStorage(tenantId: string, id: string): Promise<api.IDocumentStorageService> {

        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(tenantId: string, id: string): Promise<api.IDocumentDeltaStorageService> {

        return new TestDeltaStorageService(tenantId, id, this.testDeltaConnectionServer.databaseManager);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return TestDocumentDeltaConnection.Create(
            tenantId,
            id,
            this.tokenProvider.token,
            client,
            this.testDeltaConnectionServer.webSocketServer);
    }

    public async branch(tenantId: string, id: string): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
