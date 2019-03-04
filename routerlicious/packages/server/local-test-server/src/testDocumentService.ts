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
        private tenantId: string,
        private id: string) {
    }

    public async createTokenProvider(tokens: { [name: string]: string }): Promise<api.ITokenProvider> {
        return new socketStorage.TokenProvider(tokens.jwt);
    }

    public async connectToStorage(tokenProvider: api.ITokenProvider): Promise<api.IDocumentStorageService> {

        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(tokenProvider: api.ITokenProvider): Promise<api.IDocumentDeltaStorageService> {

        return new TestDeltaStorageService(this.tenantId, this.id, this.testDeltaConnectionServer.databaseManager);
    }

    public async connectToDeltaStream(
        tokenProvider: api.ITokenProvider,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const token = (tokenProvider as socketStorage.TokenProvider).token;
        return TestDocumentDeltaConnection.Create(
            this.tenantId,
            this.id,
            token,
            client,
            this.testDeltaConnectionServer.webSocketServer);
    }

    public async branch(tokenProvider: api.ITokenProvider): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
