import * as api from "@prague/container-definitions";
import { FileDeltaStorageService } from "./fileDeltaStorageService";
import { ReplayFileDeltaConnection } from "./fileDocumentDeltaConnection";
import { FileDocumentStorageService } from "./fileDocumentStorageService";

/**
 * The DocumentService manages the different endpoints for connecting to
 * underlying storage for file document service.
 */
export class FileDocumentService implements api.IDocumentService {

    private readonly fileDeltaStorageService: FileDeltaStorageService;
    constructor(private readonly path: string) {
        this.fileDeltaStorageService = new FileDeltaStorageService(this.path);
    }

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        const fileDocumentStorageService = new FileDocumentStorageService(this.path);
        return fileDocumentStorageService;
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return this.fileDeltaStorageService;
    }

    /**
     * Connects to a delta storage endpoint of provided documentService to get ops and then replaying
     * them so as to mimic a delta stream endpoint.
     *
     * @param client - Client that connects to socket.
     * @returns returns the delta stream service.
     */
    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return ReplayFileDeltaConnection.Create(this.fileDeltaStorageService);
    }

    public async branch(): Promise<string | null> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return null;
    }
}
