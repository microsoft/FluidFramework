import * as api from "@prague/client-api";
import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import { TestDeltaStorageService } from "./testDeltaStorageService";
import { TestDocumentService } from "./testDocumentService";

class TestDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private deltaUrl: string, private blobUrl: string, private repository: string) {}

    public createDocumentService(url: IResolvedUrl): Promise<IDocumentService> {
        return Promise.resolve(getTestService(this.deltaUrl, this.blobUrl, this.repository));
    }
}

export function registerAsTest(deltaUrl: string, blobUrl: string, repository: string) {
    const serviceFactory = new TestDocumentServiceFactory(deltaUrl, blobUrl, repository);
    api.registerDocumentServiceFactory(serviceFactory);
}

export function getTestService(deltaUrl: string, blobUrl: string, repository: string): IDocumentService {
    const deltaStorage = new TestDeltaStorageService();
    const service = new TestDocumentService(deltaStorage);

    return service;
}
