import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { ISocketStorageDiscovery } from "./contracts";
import { DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentService } from "./documentService";
import { IGetter } from "./Getter";
import { SharepointDeltaStorageService } from "./SharepointDeltaStorageService";
import { ISharepointSnapshot } from "./SharepointDocumentServiceFactory";
import { SharepointDocumentStorageManager } from "./SharepointDocumentStorageManager";
import { SharepointDocumentStorageService } from "./SharepointDocumentStorageService";
import { TokenProvider } from "./token";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class SharepointDocumentService implements api.IDocumentService {
    private attemptedDeltaStreamConnection: boolean;
    private readonly joinSessionP: SinglePromise<ISocketStorageDiscovery>;
    private tokenProvider: TokenProvider;

    constructor(
        private readonly appId: string,
        private readonly snapshot: Promise<ISharepointSnapshot | undefined>,
        private readonly storageGetter: IGetter,
        private readonly deltasGetter: IGetter,
        private socketStorageDiscovery: ISocketStorageDiscovery,
        joinSession: () => Promise<ISocketStorageDiscovery>,
    ) {
        this.attemptedDeltaStreamConnection = false;
        this.joinSessionP = new SinglePromise(joinSession);
        this.tokenProvider = new TokenProvider(socketStorageDiscovery.storageToken, socketStorageDiscovery.socketToken);
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for sharepoint driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        let blobs: resources.IBlob[] | undefined;
        let trees: resources.ITree[] | undefined;
        let latestSha: string | undefined;
        const snapshot = await this.snapshot;
        if (snapshot) {
            trees = snapshot.trees;
            latestSha = snapshot.sha;
            blobs = snapshot.blobs;
        }

        return new SharepointDocumentStorageService(
            new SharepointDocumentStorageManager(
                { app_id: this.appId },
                this.socketStorageDiscovery.id,
                this.socketStorageDiscovery.snapshotStorageUrl,
                latestSha,
                trees,
                blobs,
                this.storageGetter,
                this.tokenProvider,
                async (refresh) => {
                    if (refresh) {
                        await this.refreshKnowledge();
                    }
                    return this.tokenProvider;
                },
            ),
        );
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for sharepoint driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        const snapshot = await this.snapshot;
        const ops = snapshot ? snapshot.ops || [] : undefined;

        return new DocumentDeltaStorageService(
            this.socketStorageDiscovery.tenantId,
            this.socketStorageDiscovery.id,
            this.tokenProvider,
            new SharepointDeltaStorageService(
                { app_id: this.appId },
                this.socketStorageDiscovery.deltaStorageUrl,
                this.deltasGetter,
                ops,
                async (refresh) => {
                    if (refresh) {
                        await this.refreshKnowledge();
                    }

                    if (!this.tokenProvider.storageToken) {
                        throw new Error("unexpected missing storageToken upon refresh attempt!");
                    }

                    return this.tokenProvider.storageToken;
                },
            ),
        );
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for sharepoint driver.
     */
    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        // TODO: we should add protection to ensure we are only ever processing one connectToDeltaStream

        // when it's not the first time through it means we are trying to reconnect to a disconnected websocket.
        // In this scenario we should refresh our knowledge before attempting to connect
        if (this.attemptedDeltaStreamConnection) {
            await this.refreshKnowledge();
        }

        this.attemptedDeltaStreamConnection = true;

        const documentService = new DocumentService(
            this.socketStorageDiscovery.snapshotStorageUrl,
            this.socketStorageDiscovery.deltaStorageUrl,
            this.socketStorageDiscovery.deltaStreamSocketUrl,
            this.tokenProvider,
            this.socketStorageDiscovery.tenantId,
            this.socketStorageDiscovery.id,
        );

        return documentService.connectToDeltaStream(client);
    }

    public async branch(): Promise<string> {
        return "";
    }

    public getErrorTrackingService(): api.IErrorTrackingService {
        return { track: () => null };
    }

    private async refreshKnowledge(): Promise<void> {
        this.socketStorageDiscovery = await this.joinSessionP.response;
        this.tokenProvider = new TokenProvider(
            this.socketStorageDiscovery.storageToken,
            this.socketStorageDiscovery.socketToken,
        );
    }
}

class SinglePromise<T> {
    private pResponse: Promise<T> | undefined;
    private active: boolean;
    constructor(private readonly fn: () => Promise<T>) {
        this.active = false;
    }

    public get response(): Promise<T> {
        // if we are actively running and we have a response return it
        if (this.active && this.pResponse) {
            return this.pResponse;
        }

        this.active = true;
        this.pResponse = this.fn()
            .then((response) => {
                this.active = false;
                return response;
            })
            .catch((e) => {
                this.active = false;
                return Promise.reject(e);
            });

        return this.pResponse;
    }
}
