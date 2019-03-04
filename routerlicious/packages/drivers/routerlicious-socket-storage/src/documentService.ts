import * as api from "@prague/container-definitions";
import { GitManager, Historian, ICredentials, IGitCache } from "@prague/services-client";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import Axios from "axios";
import * as io from "socket.io-client";
import { DocumentStorageService } from "./blobStorageService";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { TokenProvider } from "./tokens";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    private deltaStorage: DeltaStorageService;

    constructor(
        protected deltaUrl: string,
        private gitUrl: string,
        private errorTracking: api.IErrorTrackingService,
        private disableCache: boolean,
        private historianApi: boolean,
        private directCredentials: ICredentials,
        private gitCache: IGitCache,
        protected tenantId: string,
        protected documentId: string) {

        this.deltaStorage = new DeltaStorageService(this.deltaUrl);
    }

    public async createTokenProvider(tokens: { [name: string]: string }): Promise<api.ITokenProvider> {
        return new TokenProvider(tokens.jwt);
    }

    public async connectToStorage(tokenProvider: api.ITokenProvider): Promise<api.IDocumentStorageService> {

        const endpoint = `${this.gitUrl}/repos/${encodeURIComponent(this.tenantId)}`;

        // Craft credentials - either use the direct credentials (i.e. a GitHub user + PAT) - or make use of our
        // tenant token
        let credentials: ICredentials;
        if (this.directCredentials) {
            credentials = this.directCredentials;
        } else {
            const token = (tokenProvider as TokenProvider).token;
            if (token) {
                credentials = {
                    password: token,
                    user: this.tenantId,
                };
            }
        }

        const historian = new Historian(
            endpoint,
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

        return new DocumentStorageService(this.tenantId, this.documentId, gitManager);
    }

    public async connectToDeltaStorage(tokenProvider: api.ITokenProvider): Promise<api.IDocumentDeltaStorageService> {

        return new DocumentDeltaStorageService(this.tenantId, this.documentId, tokenProvider, this.deltaStorage);
    }

    public async connectToDeltaStream(
        tokenProvider: api.ITokenProvider,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const token = (tokenProvider as TokenProvider).token;
        return DocumentDeltaConnection.Create(this.tenantId, this.documentId, token, io, client, this.deltaUrl);
    }

    public async branch(tokenProvider: api.ITokenProvider): Promise<string> {
        let headers = null;
        const token = (tokenProvider as TokenProvider).token;
        if (token) {
            headers = {
                Authorization: `Basic ${new Buffer(`${this.tenantId}:${token}`).toString("base64")}`,
            };
        }

        // tslint:disable-next-line:max-line-length
        const result = await Axios.post<string>(`${this.deltaUrl}/documents/${this.tenantId}/${this.documentId}/forks`, { headers });
        return result.data;
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
