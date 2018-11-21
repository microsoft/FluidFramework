import * as api from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";
import { TestDeltaStorageService } from "./testDeltaStorageService";
import { TestDocumentDeltaConnection } from "./testDocumentDeltaConnection";
import { TestDocumentStorageService } from "./testDocumentStorageService";

/**
 */
export class TestDocumentService implements api.IDocumentService {
    constructor(private testDeltaConnectionServer: ITestDeltaConnectionServer) {
    }

    public async connectToStorage(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentStorageService> {

        return new TestDocumentStorageService();
    }
    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider): Promise<api.IDocumentDeltaStorageService> {

        return new TestDeltaStorageService(tenantId, id, this.testDeltaConnectionServer.databaseManager);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const token = (tokenProvider as socketStorage.TokenProvider).token;
        return TestDocumentDeltaConnection.Create(
            tenantId,
            id,
            token,
            client,
            this.testDeltaConnectionServer.webSocketServer);
    }

    public async branch(
        tenantId: string,
        id: string,
        tokenProvider: api.ITokenProvider): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
