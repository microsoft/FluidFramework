import { IDocumentService } from "@prague/container-definitions";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";
import { TestDocumentService } from "./testDocumentService";

export function createTestDocumentService(
    testDeltaConnectionServer: ITestDeltaConnectionServer,
    tenantId: string,
    id: string): IDocumentService {
    const service = new TestDocumentService(testDeltaConnectionServer, tenantId, id);
    return service;
}
