import * as socketStorage from ".";
import * as api from "../api";
import { GitManager } from "../git-storage";

// TODO TODO TODO need to fix this up yo!
const historian = null;

export function getDefaultService(deltaUrl: string, blobUrl: string, repository: string): api.IDocumentService {
    const gitManager = new GitManager(historian, repository);
    const blobStorage = new socketStorage.BlobStorageService(gitManager);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);
    const service = new socketStorage.DocumentService(deltaUrl, deltaStorage, blobStorage);

    return service;
}

export function registerAsDefault(deltaUrl: string, blobUrl: string, repository: string) {
    const service = getDefaultService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}
