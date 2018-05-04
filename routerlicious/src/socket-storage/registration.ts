import * as socketStorage from ".";
import * as api from "../api";
import { IDocumentService } from "../api-core";
import { GitManager } from "../git-storage";
import { Historian } from "../services-client";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    tenantId: string,
    disableCache = false,
    historianApi = true,
    credentials?): IDocumentService {

    const endpoint = `${gitUrl}/repos/${tenantId}`;
    const historian = new Historian(endpoint, historianApi, disableCache, credentials);
    const gitManager = new GitManager(historian);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);
    const service = new socketStorage.DocumentService(deltaUrl, deltaStorage, gitManager);

    return service;
}

export function registerAsDefault(
    deltaUrl: string,
    gitUrl: string,
    tenantId: string,
    disableCache = false,
    historianApi = true,
    credentials?) {

    const service = createDocumentService(
        deltaUrl,
        gitUrl,
        tenantId,
        disableCache,
        historianApi,
        credentials);
    api.registerDocumentService(service);
}
