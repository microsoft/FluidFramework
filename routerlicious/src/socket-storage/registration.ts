import * as socketStorage from ".";
import * as api from "../api";

export function getDefaultService(deltaUrl: string, blobUrl: string, repository: string): api.IDocumentService {
    const blobStorage = new socketStorage.BlobStorageService(blobUrl, repository);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);
    const service = new socketStorage.DocumentService(deltaUrl, deltaStorage, blobStorage);

    return service;
}

export function registerAsDefault(deltaUrl: string, blobUrl: string, repository: string) {
    const service = getDefaultService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}

// Implementation for test.
export function registerAsTest(deltaUrl: string, blobUrl: string, repository: string) {
    const service = getTestService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}

export function getTestService(deltaUrl: string, blobUrl: string, repository: string): api.IDocumentService {
    const blobStorage = new socketStorage.FakeBlobStorageService();
    const deltaStorage = new socketStorage.FakeDeltaStorageService();
    const service = new socketStorage.FakeDocumentService(deltaUrl, deltaStorage, blobStorage);

    return service;
}
