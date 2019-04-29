import { IDocumentService } from "@prague/container-definitions";
import { TokenProvider } from "@prague/routerlicious-socket-storage";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";
import { TestDocumentService } from "./testDocumentService";

export function createTestDocumentService(
    testDeltaConnectionServer: ITestDeltaConnectionServer,
    tokenProvider: TokenProvider,
    tenantId: string,
    documentId: string): IDocumentService {
        return new TestDocumentService(testDeltaConnectionServer, tokenProvider, tenantId, documentId);
}
