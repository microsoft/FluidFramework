import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import { createTestDocumentService } from "./registration";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";

export class TestDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private testDeltaConnectionServer: ITestDeltaConnectionServer) {}

    public createDocumentService(url: IResolvedUrl): Promise<IDocumentService> {
        return Promise.resolve(createTestDocumentService(this.testDeltaConnectionServer));
    }
}
