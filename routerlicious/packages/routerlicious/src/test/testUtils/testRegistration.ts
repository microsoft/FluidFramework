import { api, core as apiCore } from "@prague/client-api";
import * as testUtils from "./";

export function registerAsTest(deltaUrl: string, blobUrl: string, repository: string) {
    const service = getTestService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}

export function getTestService(deltaUrl: string, blobUrl: string, repository: string): apiCore.IDocumentService {
    const deltaStorage = new testUtils.TestDeltaStorageService();
    const service = new testUtils.TestDocumentService(deltaStorage);

    return service;
}
