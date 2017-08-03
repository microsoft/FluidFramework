import * as socketStorage from ".";
import * as api from "../api";

export function getDefaultService(url: string): api.IDocumentService {
    const blobStorage = new socketStorage.BlobStorageService(url);
    const deltaStorage = new socketStorage.DeltaStorageService(url);
    const service = new socketStorage.DocumentService(url, deltaStorage, blobStorage);

    return service;
}

export function registerAsDefault(url: string) {
    const service = getDefaultService(url);
    api.registerDocumentService(service);
}
