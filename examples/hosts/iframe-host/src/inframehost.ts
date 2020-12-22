/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import {
    AttachState,
    ICodeLoader,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    IRuntimeState,
    IProxyLoaderFactory,
} from "@fluidframework/container-definitions";
import { Loader, Container } from "@fluidframework/container-loader";
import { IRequest, IResponse, IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import {
    MultiDocumentServiceFactory,
    MultiUrlResolver,
} from "@fluidframework/driver-utils";
import {
    DocumentServiceFactoryProxy,
    IDocumentServiceFactoryProxyKey,
    IUrlResolverProxyKey,
    OuterUrlResolver,
} from "@fluidframework/iframe-driver";
import { ISequencedDocumentMessage, ITree, ISummaryTree } from "@fluidframework/protocol-definitions";

export interface IFrameInnerApi {
    /**
     * Set the MessagePort which inner IFrame components can wrap
     * to obtain an outer proxy
     * @param innerPort - Port2 of a MessageChannel
     */
    setMessagePort(innerPort: MessagePort): Promise<void>;
    /**
     * Load a container
     * @param documentId - id for the container
     * @param createNew - if a new container should be created
     * @returns An identifier for the container that can be used with this API
     */
    loadContainer(documentId: string, createNew: boolean): Promise<string>;
    /**
     * Attach the container with the given id inside the IFrame
     * @param containerId - the containerid on which to call attach
     * @param request - the request to pass to the attach call
     */
    attachContainer(containerId: string, request: IRequest): Promise<void>;
}

export interface IFrameOuterHostConfig {
    documentServiceFactory: IDocumentServiceFactory;
    urlResolver: IUrlResolver;

    // Any config to be provided to loader.
    options?: any;

    // A Fluid object that gives host provided capabilities/configurations
    // to the Fluid object in the container(such as auth).
    scope?: IFluidObject;

    proxyLoaderFactories?: Map<string, IProxyLoaderFactory>;
}

class ProxyRuntime implements IRuntime {
    private _disposed = false;
    public get disposed() { return this._disposed; }

    public dispose(): void {
        this._disposed = true;
    }

    async request(request: IRequest): Promise<IResponse> {
        throw new Error("Method not implemented.");
    }
    async snapshot(tagMessage: string, fullTree?: boolean | undefined): Promise<ITree | null> {
        throw new Error("Method not implemented.");
    }
    async setConnectionState(connected: boolean, clientId?: string) {
    }
    async stop(): Promise<IRuntimeState> {
        throw new Error("Method not implemented.");
    }
    async process(message: ISequencedDocumentMessage, local: boolean, context: any) {
    }
    async processSignal(message: any, local: boolean) {
    }
    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    createSummary(): ISummaryTree {
        throw new Error("Method not implemented.");
    }
    setAttachState(state: AttachState.Attaching | AttachState.Attached) {
    }
    getPendingLocalState() {
        throw new Error("Method not implemented.");
    }
}

class ProxyChaincode implements IRuntimeFactory {
    async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        return new ProxyRuntime();
    }

    get IRuntimeFactory() {
        return this;
    }
}

class ProxyCodeLoader implements ICodeLoader {
    async load() {
        return Promise.resolve({ fluidExport: new ProxyChaincode() });
    }
}

export class IFrameOuterHost {
    private readonly loader: Loader;
    constructor(private readonly hostConfig: IFrameOuterHostConfig) {
        // todo
        // disable summaries
        // set as non-user client
        this.loader = new Loader({
            ...hostConfig,
            codeLoader: new ProxyCodeLoader(),
        });
    }

    /**
     * Set up the outer proxies for an IFrame
     * @param iframe - The IFrame on which to expose methods (it still needs
     * to be set up internally separately)
     * @returns The MessagePort to provide to the IFrame after it has loaded
     */
    public async loadOuterProxy(iframe: HTMLIFrameElement): Promise<MessagePort> {
        // With comlink, only a single object should be exposed on a single window
        // (because it uses message event listeners under the hood) so combine
        // them all in one (otherwise there are mysterious runtime errors)
        const combinedProxy = {};

        const outerDocumentServiceProxy =  new DocumentServiceFactoryProxy(
            MultiDocumentServiceFactory.create(this.hostConfig.documentServiceFactory),
            this.hostConfig.options,
        );
        combinedProxy[IDocumentServiceFactoryProxyKey] = outerDocumentServiceProxy.createProxy();

        const outerUrlResolverProxy = new OuterUrlResolver(
            MultiUrlResolver.create(this.hostConfig.urlResolver),
        );
        combinedProxy[IUrlResolverProxyKey] = outerUrlResolverProxy.createProxy();

        const channel = new MessageChannel();
        Comlink.expose(combinedProxy, channel.port1);

        return channel.port2;
    }

    /**
     * Use the internal loader (which is created with a dummy code loader and
     * runtime) to resolve the request to a container.  The returned container
     * provides only limited functionality.
     * @param request - The request to resolve on the internal loader
     */
    public async loadContainer(request: IRequest): Promise<Container> {
        return this.loader.resolve(request);
    }
}
