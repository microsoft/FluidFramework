import * as socketStorage from ".";
import * as api from "../api";
import * as apiCore from "../api-core";
import { GitManager } from "../git-storage";
import { Historian } from "../services-client";

interface IStorageServices {

    blobStorage: socketStorage.BlobStorageService;

    deltaStorage: socketStorage.DeltaStorageService;
}

function getStorageServices(deltaUrl: string, blobUrl: string, repository: string): IStorageServices {
    const historian = new Historian(blobUrl);
    const gitManager = new GitManager(historian, repository);
    const blobStorage = new socketStorage.BlobStorageService(gitManager);
    const deltaStorage = new socketStorage.DeltaStorageService(deltaUrl);
    return { blobStorage, deltaStorage };
}

function getDefaultService(deltaUrl: string, blobUrl: string, repository: string): apiCore.IDocumentService {
    const storage = getStorageServices(deltaUrl, blobUrl, repository);
    return new socketStorage.DocumentService(deltaUrl, storage.deltaStorage, storage.blobStorage);
}

function getLoadService(deltaUrl: string, blobUrl: string, repository: string): apiCore.IDocumentService {
    const storage = getStorageServices(deltaUrl, blobUrl, repository);
    return new socketStorage.LoadService(deltaUrl, storage.deltaStorage, storage.blobStorage);
}

export function registerAsDefault(deltaUrl: string, blobUrl: string, repository: string) {
    const service = getDefaultService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}

export function registerAsLoader(deltaUrl: string, blobUrl: string, repository: string) {
    const service = getLoadService(deltaUrl, blobUrl, repository);
    api.registerDocumentService(service);
}
