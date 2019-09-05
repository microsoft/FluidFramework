/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IClient,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    IVersion,
} from "@prague/protocol-definitions";
import { DocumentStorageService } from "@prague/routerlicious-socket-storage";
import {
    IConnected,
    IInnerDocumentDeltaConnectionProxy,
    IOuterDocumentDeltaConnection,
    OuterDocumentDeltaConnection,
} from "@prague/socket-storage-shared";
import { buildHierarchy, Deferred } from "@prague/utils";
import * as assert from "assert";
import * as Comlink from "comlink";
import { IOuterDocumentStorage, OuterDocumentStorageService } from "./outerDocumentStorageService";

const protocolVersions = ["^0.2.0", "^0.1.0"];

// tslint:disable-next-line: no-empty-interface
interface IInnerProxy extends IInnerDocumentDeltaConnectionProxy {

}

interface IOuterDeltaStorage {
    get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]>;
}

interface IOuterProxy extends IOuterDocumentDeltaConnection, IOuterDocumentStorage, IOuterDeltaStorage {
    handshake: any;
    connected(): boolean;
}

/**
 * The shell of the document Service that we'll use on the inside of an IFrame
 */
export class OuterDocumentService implements IDocumentService {
    public static async create(
        documentService: IDocumentService, frame: HTMLIFrameElement): Promise<OuterDocumentService> {

        const [storage, deltaStorage] = await Promise.all([documentService.connectToStorage(),
        documentService.connectToDeltaStorage()]);

        return new OuterDocumentService(
            storage as DocumentStorageService,
            deltaStorage,
            documentService,
            frame,
        );

    }

    private deltaConnection: IDocumentDeltaConnection | undefined;
    private readonly proxiedFunctionsFromInnerFrameP: Promise<IInnerProxy>;
    private getProxyFromOuterDocumentDeltaConnection!: (IOuterDocumentDeltaConnection) => any;

    constructor(private readonly storageService: DocumentStorageService,
                private readonly deltaStorage: IDocumentDeltaStorageService,
                private readonly documentService: IDocumentService,
                frame: HTMLIFrameElement,
    ) {

        // Host guarantees that frame and contentwindow are both loaded
        const iframeContentWindow = frame!.contentWindow!;

        const handshake = new Deferred<IInnerProxy>();
        // tslint:disable-next-line: promise-must-complete
        this.proxiedFunctionsFromInnerFrameP = handshake.promise;

        const connected = () => {
            return true;
        };

        // Put a callback in place to get the outerProxy from outerDocumentDeltaConnection
        // tslint:disable-next-line: promise-must-complete
        const deltaConnectionProxyP = new Promise<IOuterDocumentDeltaConnection>((resolve) => {
            this.getProxyFromOuterDocumentDeltaConnection = resolve;
        });

        deltaConnectionProxyP
            .then(async (deltaConnectionProxy) => {
                // documentStorageProxy
                const customGetVersions = async (versionId: string, count: number) => {
                    const commits = await this.storageService.manager.getCommits(versionId ?
                        versionId : this.storageService.id, count);
                    return commits.map((commit) => ({ id: commit.sha, treeId: commit.commit.tree.sha }));
                };

                const customGetSnapshotTree = async (version?: IVersion) => {
                    let requestVersion = version;
                    if (!requestVersion) {
                        const versions = await customGetVersions(this.storageService.id, 1);
                        if (versions.length === 0) {
                            return null;
                        }

                        requestVersion = versions[0];
                    }

                    const tree = await this.storageService.manager.getTree(requestVersion.treeId);
                    return buildHierarchy(tree);
                };

                const customRead = async (blobId: string) => {
                    const value = await this.storageService.manager.getBlob(blobId);
                    return value.content;
                };

                const documentStorageProxy = {
                    getSnapshotTree: customGetSnapshotTree,
                    getVersions: customGetVersions,
                    read: customRead,
                };

                // deltaStorageProxy
                const customGet = async (from?: number, to?: number) => {
                    const val = this.deltaStorage.get(from, to);
                    return val;
                };

                const deltaStorageProxy: IOuterDeltaStorage = {
                    get: customGet,
                };

                const outerDocumentServiceProxy: IOuterProxy = {
                    ...deltaConnectionProxy,
                    ...documentStorageProxy,
                    ...deltaStorageProxy,
                    handshake,
                    connected,
                };

                iframeContentWindow.window.postMessage("EndpointExposed", "*");
                const endpoint = Comlink.windowEndpoint(iframeContentWindow);
                Comlink.expose(outerDocumentServiceProxy, endpoint);
            })
            .catch((err) => {
                console.error(err);
            });
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new OuterDocumentStorageService();
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return Promise.reject(new Error("OuterDocumentService: connectToDeltaStorage not implemented"));
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        this.deltaConnection = await this.documentService.connectToDeltaStream(client);
        assert((this.deltaConnection as any).socket !== undefined);

        const connection: IConnected = {
            claims: this.deltaConnection.claims,
            clientId: this.deltaConnection.clientId,
            existing: this.deltaConnection.existing,
            initialContents: this.deltaConnection.initialContents,
            initialMessages: this.deltaConnection.initialMessages,
            initialSignals: this.deltaConnection.initialSignals,
            maxMessageSize: this.deltaConnection.maxMessageSize,
            parentBranch: this.deltaConnection.parentBranch,
            serviceConfiguration: this.deltaConnection.serviceConfiguration,
            version: this.deltaConnection.version,
            supportedVersions: protocolVersions,
        };

        return OuterDocumentDeltaConnection.create(
            this.deltaConnection,
            connection,
            this.proxiedFunctionsFromInnerFrameP,
            this.getProxyFromOuterDocumentDeltaConnection,
        );
    }

    public async branch(): Promise<string> {
        return Promise.reject(new Error("Outer Document Service: branch not implemented"));
    }

    public getErrorTrackingService() {
        throw new Error("Outer Document Service: getErrorTrackingService not implemented");
        return null;
    }
}
