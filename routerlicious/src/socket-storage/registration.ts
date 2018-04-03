import * as socketStorage from ".";
import * as api from "../api";
import { IDocumentService } from "../api-core";
import { GitManager } from "../git-storage";
import { Historian } from "../services-client";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    owner: string,
    repository: string,
    disableCache = false,
    historianApi = true,
    credentials?): IDocumentService {

    const historian = new Historian(gitUrl, historianApi, disableCache, credentials);
    const gitManager = new GitManager(historian, gitUrl, owner, repository);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);
    const service = new socketStorage.DocumentService(deltaUrl, deltaStorage, gitManager);

    return service;
}

export function registerAsDefault(
    deltaUrl: string,
    gitUrl: string,
    owner: string,
    repository: string,
    disableCache = false,
    historianApi = true,
    credentials?) {

    const service = createDocumentService(
        deltaUrl,
        gitUrl,
        owner,
        repository,
        disableCache,
        historianApi,
        credentials);
    api.registerDocumentService(service);
}
