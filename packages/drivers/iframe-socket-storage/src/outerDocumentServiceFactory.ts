/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { Deferred } from "@microsoft/fluid-common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import { configurableUrlResolver } from "@microsoft/fluid-driver-utils";
import {
    ConnectionMode,
    IClient,
    IDocumentMessage,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import * as Comlink from "comlink";
import { debug } from "./debug";
import { IOuterDocumentDeltaConnectionProxy } from "./innerDocumentDeltaConnection";

const socketIOEvents = [
    "op",
    "nack",
    "pong",
    "disconnect",
    "op-content",
    "signal",
    "connect_error",
    "connect_timeout",
    "connect_document_success",
];

export interface IDocumentServiceFactoryProxy {
    clients: {
        [clientId: string]: {
            clientId: string;
            stream: IOuterDocumentDeltaConnectionProxy;
            deltaStorage: IDocumentDeltaStorageService;
            storage: IDocumentStorageService;
        };
    };

    createDocumentService(resolvedUrl: IFluidResolvedUrl): Promise<string>;
    connected(): Promise<void>;
}

/**
 * Creates a proxy outerdocumentservice from either a resolvedURL or a request
 * Remotes the real connection to an iframe
 */
export class IFrameDocumentServiceProxyFactory {

    public static async create(
        documentServiceFactory: IDocumentServiceFactory,
        frame: HTMLIFrameElement,
        options: any,
        urlResolver: IUrlResolver | IUrlResolver[],
    ) {
        return new IFrameDocumentServiceProxyFactory(documentServiceFactory, frame, options, urlResolver);
    }

    public readonly protocolName = "fluid-outer:";
    private documentServiceProxy: DocumentServiceFactoryProxy | undefined;

    constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly frame: HTMLIFrameElement,
        private readonly options: any,
        private readonly urlResolver: IUrlResolver | IUrlResolver[],
    ) {

    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<void> {

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        this.documentServiceProxy = new DocumentServiceFactoryProxy(
            this.documentServiceFactory,
            this.options,
            resolvedUrl as IFluidResolvedUrl,
        );

        return this.createProxy();
    }

    public async createDocumentServiceFromRequest(request: IRequest): Promise<void> {
        // Simplify this with either https://github.com/microsoft/FluidFramework/pull/448
        // or https://github.com/microsoft/FluidFramework/issues/447
        const resolvers: IUrlResolver[] = [];
        if (!(Array.isArray(this.urlResolver))) {
            resolvers.push(this.urlResolver);
        } else {
            resolvers.push(... this.urlResolver);
        }

        const resolvedUrl = await configurableUrlResolver(resolvers, request);
        if (!resolvedUrl) {
            return Promise.reject("No Resolver for request");
        }

        return this.createDocumentService(resolvedUrl);
    }

    private async createProxy() {

        // Host guarantees that frame and contentWindow are both loaded
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const iframeContentWindow = this.frame.contentWindow!;

        iframeContentWindow.window.postMessage("EndpointExposed", "*");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        Comlink.expose(this.documentServiceProxy!.getProxy(), Comlink.windowEndpoint(iframeContentWindow));
    }
}

/**
 * Proxy of the Document Service Factory that gets sent to the innerFrame
 */
export class DocumentServiceFactoryProxy implements IDocumentServiceFactoryProxy {
    public clients: {
        [clientId: string]: {
            clientId: string;
            stream: IOuterDocumentDeltaConnectionProxy;
            deltaStorage: IDocumentDeltaStorageService;
            storage: IDocumentStorageService;
        },
    };

    private readonly tokens: {
        [name: string]: string;
    };

    constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly options: any,
        private readonly resolvedUrl: IFluidResolvedUrl,
    ) {

        this.tokens = this.resolvedUrl.tokens;
        this.clients = {};
    }

    public async createDocumentService(resolvedUrl: IFluidResolvedUrl): Promise<string> {
        resolvedUrl.tokens = this.tokens;

        const connectedDocumentService: IDocumentService =
            await this.documentServiceFactory.createDocumentService(resolvedUrl);

        const clientDetails = this.options ? (this.options.client as IClient) : null;
        const mode: ConnectionMode = "write";

        const [deltaStream, deltaStorage, storage] = await Promise.all([
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            connectedDocumentService.connectToDeltaStream(clientDetails!, mode),
            connectedDocumentService.connectToDeltaStorage(),
            connectedDocumentService.connectToStorage(),
        ]);

        const clientId = deltaStream.clientId;
        const combinedDriver = {
            clientId,
            stream: this.getOuterDocumentDeltaConnection(deltaStream),
            deltaStorage: this.getDeltaStorage(deltaStorage),
            storage: this.getStorage(storage),
        };

        this.clients[clientId] = combinedDriver;

        return clientId;
    }

    public async connected(): Promise<void> {
        debug("IFrame Connection Succeeded");
        return;
    }

    public getProxy(): IDocumentServiceFactoryProxy {
        return {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            connected: this.connected,
            clients: this.clients,
            // Continue investigation of scope after feature check in
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            createDocumentService: (resolvedUrl: IFluidResolvedUrl) => this.createDocumentService(resolvedUrl),
        };
    }

    private getStorage(storage: IDocumentStorageService): IDocumentStorageService {
        return {
            repositoryUrl: "Not Implemented",
            getSnapshotTree: async (version?: IVersion) => {
                return storage.getSnapshotTree(version);
            },
            getVersions: async (versionId: string | null, count: number) => {
                return storage.getVersions(versionId, count);
            },
            getContent: async (version, path) => {
                return storage.getContent(version, path);
            },
            read: async (id) => {
                return storage.read(id);
            },
            write: async (root, parents, message, ref) => {
                return storage.write(root, parents, message, ref);
            },
            createBlob: async (file) => {
                return storage.createBlob(file);
            },
            getRawUrl: (blobId) => {
                return storage.getRawUrl(blobId);
            },
            // back-compat: 0.14 uploadSummary
            uploadSummary: async (commit) => {
                return storage.uploadSummary(commit);
            },
            uploadSummaryWithContext: async (summary, context) => {
                return storage.uploadSummaryWithContext(summary, context);
            },
            downloadSummary: async (handle) => {
                return storage.downloadSummary(handle);
            },
        };
    }

    private getDeltaStorage(deltaStorage: IDocumentDeltaStorageService): IDocumentDeltaStorageService {
        const get = async (from?: number, to?: number) => deltaStorage.get(from, to);

        return {
            get,
        };
    }

    private getOuterDocumentDeltaConnection(deltaStream: IDocumentDeltaConnection) {

        const pendingOps: { type: string, args: any[] }[] = [];

        for (const event of socketIOEvents) {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            deltaStream.on(event, async (...args: any[]) => pendingOps.push({ type: event, args }));
        }

        const connection = {
            claims: deltaStream.claims,
            clientId: deltaStream.clientId,
            existing: deltaStream.existing,
            get initialClients() { return deltaStream.initialClients; },
            get initialContents() { return deltaStream.initialContents; },
            get initialMessages() { return deltaStream.initialMessages; },
            get initialSignals() { return deltaStream.initialSignals; },
            maxMessageSize: deltaStream.maxMessageSize,
            mode: deltaStream.mode,
            parentBranch: deltaStream.parentBranch,
            serviceConfiguration: deltaStream.serviceConfiguration,
            version: deltaStream.version,
            supportedVersions: ["^0.3.0", "^0.2.0", "^0.1.0"],
        };

        const getDetails = async () => connection;

        const submit = async (messages: IDocumentMessage[]) => {
            deltaStream.submit(messages);
        };

        const submitSignal = async (message: IDocumentMessage) => {
            deltaStream.submitSignal(message);
        };

        const handshake = new Deferred<any>();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handshake.promise
            .then((innerProxy: { forwardEvent(event: string, args: any[]): Promise<void> }) => {
                for (const op of pendingOps) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    innerProxy.forwardEvent(op.type, op.args);
                }

                deltaStream.removeAllListeners();

                for (const event of socketIOEvents) {
                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    deltaStream.on(event, async (...args: any[]) => { await innerProxy.forwardEvent(event, args); });
                }
            });

        const outerMethodsToProxy: IOuterDocumentDeltaConnectionProxy = {
            getDetails,
            handshake,
            submit,
            submitSignal,
        };

        return outerMethodsToProxy;
    }
}
