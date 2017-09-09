import * as api from "../../api";
import * as testUtils from "./";

export function registerAsTest(deltaUrl: string, blobUrl: string, repository: string) {
    const service = getTestService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}

export function getTestService(deltaUrl: string, blobUrl: string, repository: string): api.IDocumentService {
    const blobStorage = new testUtils.TestBlobStorageService();
    const deltaStorage = new testUtils.TestDeltaStorageService();
    const service = new testUtils.TestDocumentService(deltaUrl, deltaStorage, blobStorage);

    return service;
}
