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
     */
    public async loadOuterProxy(iframe: HTMLIFrameElement): Promise<void> {
        // With comlink, only a single object should be exposed on a single window
        // so combine them all in one (otherwise there are mysterious runtime errors)
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

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const iframeContentWindow = iframe.contentWindow!;
        iframeContentWindow.window.postMessage("EndpointExposed", "*");
        Comlink.expose(combinedProxy, Comlink.windowEndpoint(iframeContentWindow));
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
