import * as api from "@prague/container-definitions";
import { GitManager, Historian, ICredentials, IGitCache } from "@prague/services-client";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import Axios from "axios";
import * as io from "socket.io-client";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentStorageService } from "./documentStorageService";
import { NullBlobStorageService } from "./nullBlobStorageService";
import { TokenProvider } from "./tokens";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    constructor(
        protected ordererUrl: string,
        private deltaStorageUrl: string,
        private gitUrl: string,
        private errorTracking: api.IErrorTrackingService,
        private disableCache: boolean,
        private historianApi: boolean,
        private directCredentials: ICredentials | undefined,
        private gitCache: IGitCache | null | undefined,
        protected tokenProvider: TokenProvider,
        protected tenantId: string,
        protected documentId: string,
    ) {
    }

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        if (this.gitUrl === undefined) {
            return new NullBlobStorageService();
        }

        // Craft credentials - either use the direct credentials (i.e. a GitHub user + PAT) - or make use of our
        // tenant token
        let credentials: ICredentials | undefined;
        if (this.directCredentials) {
            credentials = this.directCredentials;
        } else {
            credentials = {
                password: this.tokenProvider.token,
                user: this.tenantId,
            };
        }

        const historian = new Historian(
            this.gitUrl,
            this.historianApi,
            this.disableCache,
            credentials);
        const gitManager = new GitManager(historian);

        // Insert cached seed data
        if (this.gitCache) {
            for (const ref of Object.keys(this.gitCache.refs)) {
                gitManager.addRef(ref, this.gitCache.refs[ref]);
            }

            for (const commit of this.gitCache.commits) {
                gitManager.addCommit(commit);
            }

            for (const tree of this.gitCache.trees) {
                gitManager.addTree(tree);
            }

            for (const blob of this.gitCache.blobs) {
                gitManager.addBlob(blob);
            }
        }

        return new DocumentStorageService(this.documentId, gitManager);
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl);
        return new DocumentDeltaStorageService(this.tenantId, this.documentId, this.tokenProvider, deltaStorage);
    }

    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return DocumentDeltaConnection.Create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            io,
            client,
            this.ordererUrl);
    }

    public async branch(): Promise<string> {
        let headers: {Authorization: string} | null = null;
        headers = {
            Authorization: `Basic ${Buffer.from(`${this.tenantId}:${this.tokenProvider.token}`)
                .toString("base64")}`,
        };

        // tslint:disable-next-line:max-line-length
        const result = await Axios.post<string>(`${this.ordererUrl}/documents/${this.tenantId}/${this.documentId}/forks`, { headers });
        return result.data;
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
