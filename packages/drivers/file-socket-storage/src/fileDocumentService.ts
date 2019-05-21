import * as api from "@prague/container-definitions";
import { FileDeltaStorageService } from "./fileDeltaStorageService";
import { ReplayFileDeltaConnection } from "./fileDocumentDeltaConnection";
import { FileDocumentStorageService } from "./fileDocumentStorageService";
import { NullFileDeltaStorageService } from "./nullFileDeltaStorageService";

export class FileDocumentService implements api.IDocumentService {

    private fileDeltaStorageService: FileDeltaStorageService;
    constructor(private fileName: string) {
        this.fileDeltaStorageService = new FileDeltaStorageService(this.fileName);
    }

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        const fileDocumentStorageService = new FileDocumentStorageService();
        return fileDocumentStorageService;
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        // return this.fileDeltaStorageService;
        return new NullFileDeltaStorageService();
    }

    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return ReplayFileDeltaConnection.Create(this.fileDeltaStorageService);
    }

    public get fileDeltaStorage(): api.IDocumentDeltaStorageService {
        return this.fileDeltaStorageService;
    }

    public async branch(): Promise<string | null> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return null;
    }
}
