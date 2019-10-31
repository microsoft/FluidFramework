/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IHost } from "@microsoft/fluid-container-definitions";
import { configurableUrlResolver, Deferred } from "@microsoft/fluid-core-utils";
import {
    ConnectionMode,
    IClient,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentMessage,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import * as Comlink from "comlink";
import { debug } from "./debug";
import { IOuterDocumentDeltaConnectionProxy } from "./innerDocumentDeltaConnection";

/**
 * A converter that remotes a real connection to documentServices to an iframe
 */
export class OuterDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-outer:";
    private documentServiceProxy: DocumentServiceFactoryProxy | undefined;

    constructor(private readonly documentServiceFactory: IDocumentServiceFactory,
                private readonly frameP: Promise<HTMLIFrameElement>,
                private readonly options: any,
                private readonly containerHost: IHost) {

    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {

        this.documentServiceProxy = new DocumentServiceFactoryProxy(
            this.documentServiceFactory,
            this.options,
            resolvedUrl as IFluidResolvedUrl,
        );

        await this.createProxy();

        return undefined as unknown as any;
    }

    public async createDocumentServiceFromRequest(request: IRequest): Promise<IDocumentService> {
        // Simplify this with either https://github.com/microsoft/FluidFramework/pull/448
        // or https://github.com/microsoft/FluidFramework/issues/447
        const resolvers: IUrlResolver[] = new Array();
        if (!(Array.isArray(this.containerHost.resolver as IUrlResolver[]))) {
            resolvers.push(this.containerHost.resolver as IUrlResolver);

        } else {
            resolvers.push(... (this.containerHost.resolver as IUrlResolver[]));
        }

        const resolvedUrl = await configurableUrlResolver(resolvers, request);
        if (!resolvedUrl) {
            return Promise.reject("No Resolver for request");
        }

        return this.createDocumentService(resolvedUrl);
    }

    private async createProxy() {
        const frame = await this.frameP;

        // Host guarantees that frame and contentWindow are both loaded
        const iframeContentWindow = frame!.contentWindow!;

        iframeContentWindow.window.postMessage("EndpointExposed", "*");
        Comlink.expose(this.documentServiceProxy!.getProxy(), Comlink.windowEndpoint(iframeContentWindow));
    }
}

export interface ISessionManager {
    connected(): Promise<void>;

    createDocumentService(resolvedUrl: IResolvedUrl): Promise<string>;

    add(a: number, b: number): Promise<number>;
}

export interface IDocumentServiceFactoryProxy {
    clients: {
        [clientId: string]: ICombinedDrivers;
    };

    createDocumentService(resolvedUrl: IFluidResolvedUrl): Promise<string>;
    connected(): Promise<void>;
}

export interface ICombinedDrivers {
    clientId: string;
    stream: IOuterDocumentDeltaConnectionProxy;
    deltaStorage: IDocumentDeltaStorageService;
    storage: IDocumentStorageService;
}

/**
 * Proxy of the Document Service Factory that gets sent to the innerFrame
 */
export class DocumentServiceFactoryProxy implements IDocumentServiceFactoryProxy {
    public clients: { [clientId: string]: ICombinedDrivers };

    private readonly tokens: {
        [name: string]: string;
    };

    constructor(private readonly documentServiceFactory: IDocumentServiceFactory,
                private readonly options: any,
                private readonly resolvedUrl: IFluidResolvedUrl) {

        this.tokens = this.resolvedUrl.tokens;
        this.clients = {};
    }

    public async createDocumentService(resolvedUrl: IFluidResolvedUrl): Promise<string> {
        resolvedUrl.tokens = this.tokens;

        const connectedDocumentService: IDocumentService =
            await this.documentServiceFactory.createDocumentService(resolvedUrl);

        // tslint:disable-next-line: no-unsafe-any
        const clientDetails = this.options ? (this.options.client as IClient) : null;
        const mode: ConnectionMode = "write";

        const [deltaStream, deltaStorage, storage] = await Promise.all([
            connectedDocumentService.connectToDeltaStream(clientDetails!, mode),
            connectedDocumentService.connectToDeltaStorage(),
            connectedDocumentService.connectToStorage(),
        ]);

        const clientId = deltaStream.clientId;
        const combinedDriver: ICombinedDrivers = {
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
            connected: this.connected,
            clients: this.clients,
            // Are tokens are still visible on the scope of this proxied object?
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
            uploadSummary: async (commit) => {
                return storage.uploadSummary(commit);
            },
            downloadSummary: async (handle) => {
                return storage.downloadSummary(handle);
            },
        };
    }

    private getDeltaStorage(deltaStorage: IDocumentDeltaStorageService): IDocumentDeltaStorageService {
        const get = async (from?: number, to?: number) => {
            return deltaStorage.get(from, to);
        };

        return {
            get,
        };
    }

    // tslint:disable-next-line: max-func-body-length
    private getOuterDocumentDeltaConnection(deltaStream: IDocumentDeltaConnection) {

        const pendingOps: {type: string, args: any[]}[] = new Array();

        deltaStream.on("op", async (...args: any[]) => {
            pendingOps.push({type: "op", args});
        });

        deltaStream.on("nack", async (...args: any[]) => {
            pendingOps.push({type: "nack", args});
        });

        deltaStream.on("pong", async (...args: any[]) => {
            pendingOps.push({type: "pong", args});
        });

        deltaStream.on("disconnect", async (...args: any[]) => {
            pendingOps.push({type: "disconnect", args});
        });

        deltaStream.on("op-content", async (...args: any[]) => {
            pendingOps.push({type: "op", args});
        });

        deltaStream.on("signal", async (...args: any[]) => {
            pendingOps.push({type: "signal", args});
        });

        deltaStream.on("connect_error", async (...args: any[]) => {
            pendingOps.push({type: "connect_error", args});
        });

        deltaStream.on("connect_timeout", async (...args: any[]) => {
            pendingOps.push({type: "connect_timeout", args});
        });

        deltaStream.on("connect_document_success", async (...args: any[]) => {
            pendingOps.push({type: "connect_document_success", args});
        });

        deltaStream.on("connect_document_success", async (...args: any[]) => {
            pendingOps.push({type: "connect_document_success", args});
        });

        const connection = {
            claims: deltaStream.claims,
            clientId: deltaStream.clientId,
            existing: deltaStream.existing,
            initialContents: deltaStream.initialContents,
            initialMessages: deltaStream.initialMessages,
            initialSignals: deltaStream.initialSignals,
            initialClients: deltaStream.initialClients,
            maxMessageSize: deltaStream.maxMessageSize,
            mode: deltaStream.mode,
            parentBranch: deltaStream.parentBranch,
            serviceConfiguration: deltaStream.serviceConfiguration,
            version: deltaStream.version,
            supportedVersions: ["^0.3.0", "^0.2.0", "^0.1.0"],
        };

        const getDetails = async () => {
            return connection;
        };

        const submit = async (messages: IDocumentMessage[]) => {
            deltaStream.submit(messages);
        };

        const submitSignal = async (message: IDocumentMessage) => {
            deltaStream.submitSignal(message);
        };

        const handshake = new Deferred<any>();
        // tslint:disable-next-line: no-floating-promises
        handshake.promise
            .then((innerProxy: { forwardEvent(event: string, args: any[]): Promise<void> }) => {
                for (const op of pendingOps) {
                    // tslint:disable-next-line: no-floating-promises
                    innerProxy.forwardEvent(op.type, op.args);
                }
                deltaStream.removeAllListeners();

                deltaStream.on("op", async (...args: any[]) => {
                    await innerProxy.forwardEvent("op", args);
                });

                deltaStream.on("nack", async (...args: any[]) => {
                    await innerProxy.forwardEvent("nack", args);
                });

                deltaStream.on("pong", async (...args: any[]) => {
                    await innerProxy.forwardEvent("pong", args);
                });

                deltaStream.on("disconnect", async (...args: any[]) => {
                    await innerProxy.forwardEvent("disconnect", args);
                });

                deltaStream.on("op-content", async (...args: any[]) => {
                    await innerProxy.forwardEvent("op-content", args);
                });

                deltaStream.on("signal", async (...args: any[]) => {
                    await innerProxy.forwardEvent("signal", args);
                });

                deltaStream.on("connect_error", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_error", args);
                });

                deltaStream.on("connect_timeout", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_timeout", args);
                });

                deltaStream.on("connect_document_success", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_document_success", args);
                });

                deltaStream.on("connect_document_success", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_document_success", args);
                });
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
