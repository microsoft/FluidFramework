/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DocumentServiceFactoryProxy,
} from "@fluidframework/iframe-driver";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    ICodeLoader,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    IRuntimeState,
    AttachState,
    IProxyLoaderFactory,
} from "@fluidframework/container-definitions";
import { MultiDocumentServiceFactory } from "@fluidframework/driver-utils";
import { IRequest, IResponse, IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ITree, ISummaryTree } from "@fluidframework/protocol-definitions";

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

export class ProxyCodeLoader implements ICodeLoader {
    async load() {
        return Promise.resolve({ fluidExport: new ProxyChaincode() });
    }
}

export interface IFrameOuterHostConfig {
    documentServiceFactory: IDocumentServiceFactory;
    urlResolver: IUrlResolver;
    codeLoader: ICodeLoader,

    // Any config to be provided to loader.
    options?: any;

    // A Fluid object that gives host provided capabilities/configurations
    // to the Fluid object in the container(such as auth).
    scope?: IFluidObject;

    proxyLoaderFactories?: Map<string, IProxyLoaderFactory>;
}

export class IFrameOuterHost {
    private readonly loader: Loader;
    constructor(private readonly hostConfig: IFrameOuterHostConfig) {
        // todo
        // disable summaries
        // set as non-user client
        this.loader = new Loader({
            ...hostConfig,
        });
    }

    public async loadOuterProxy(iframe: HTMLIFrameElement): Promise<void> {
        const outerProxy =  new DocumentServiceFactoryProxy(
            MultiDocumentServiceFactory.create(this.hostConfig.documentServiceFactory),
            this.hostConfig.options,
            iframe,
        );
        void outerProxy;
    }

    public async getContainerForRequest(request: IRequest): Promise<Container> {
        return this.loader.resolve(request);
    }
}
