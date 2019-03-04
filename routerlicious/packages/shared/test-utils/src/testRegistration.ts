import * as api from "@prague/client-api";
import { IDocumentService } from "@prague/container-definitions";
import { TestDeltaStorageService } from "./testDeltaStorageService";
import { TestDocumentService } from "./testDocumentService";

export function registerAsTest(deltaUrl: string, blobUrl: string, repository: string, id: string, tenantId: string) {
    const service = getTestService(deltaUrl, blobUrl, repository, id, tenantId);
    api.registerDocumentService(service);
}

export function getTestService(
    deltaUrl: string,
    blobUrl: string,
    repository: string,
    id: string,
    tenantId: string,
    ): IDocumentService {
    const deltaStorage = new TestDeltaStorageService();
    const service = new TestDocumentService(deltaStorage, id, tenantId);

    return service;
}
