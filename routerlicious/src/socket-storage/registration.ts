import * as socketStorage from ".";
import * as api from "../api";

export function registerAsDefault(url: string) {
    const blobStorage = new socketStorage.BlobStorageService(url);
    const deltaStorage = new socketStorage.DeltaStorageService(url);
    const service = new socketStorage.DocumentService(url, deltaStorage, blobStorage);
    api.registerDocumentService(service);
}
