import * as socketStorage from ".";
import * as api from "../api";
import { IDocumentService } from "../api-core";
import { GitManager } from "../git-storage";
import { Historian } from "../services-client";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    owner: string,
    repository: string): IDocumentService {

    const historian = new Historian(gitUrl);
    const gitManager = new GitManager(historian, gitUrl, owner, repository);
    const blobStorage = new socketStorage.BlobStorageService(gitManager);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);

    const service = new socketStorage.DocumentService(
        deltaUrl,
        deltaStorage,
        blobStorage,
        gitManager);

    return service;
}

export function registerAsDefault(deltaUrl: string, gitUrl: string, owner: string, repository: string) {
    const service = createDocumentService(deltaUrl, gitUrl, owner, repository);
    api.registerDocumentService(service);
}
