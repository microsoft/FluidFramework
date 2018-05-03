import * as URL from "url-parse";
import * as socketStorage from ".";
import * as api from "../api";
import { IDocumentService } from "../api-core";
import { GitManager } from "../git-storage";
import { Historian } from "../services-client";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    disableCache = false,
    historianApi = true,
    credentials?): IDocumentService {

    const parsed = URL(gitUrl);

    // Parse the owner and repository from the git URL
    const components = parsed.pathname.split("/").filter((component) => component);
    if (components.length !== 2) {
        throw new Error(`Invalid Git URL: ${gitUrl}`);
    }
    const owner = components[0];
    const repository = components[1];

    const historian = new Historian(parsed.origin, historianApi, disableCache, credentials);
    const gitManager = new GitManager(historian, gitUrl, owner, repository);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);
    const service = new socketStorage.DocumentService(deltaUrl, deltaStorage, gitManager);

    return service;
}

export function registerAsDefault(
    deltaUrl: string,
    gitUrl: string,
    disableCache = false,
    historianApi = true,
    credentials?) {

    const service = createDocumentService(
        deltaUrl,
        gitUrl,
        disableCache,
        historianApi,
        credentials);
    api.registerDocumentService(service);
}
