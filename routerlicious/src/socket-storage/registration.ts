import * as socketStorage from ".";
import * as api from "../api";
import * as apiCore from "../api-core";
import { GitManager } from "../git-storage";
import { Historian } from "../services-client";

export function getDefaultService(deltaUrl: string, blobUrl: string, repository: string): apiCore.IDocumentService {
    const historian = new Historian(blobUrl);
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
