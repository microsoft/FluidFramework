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
    IProxyLoaderFactory,
} from "@fluidframework/container-definitions";
import { MultiDocumentServiceFactory } from "@fluidframework/driver-utils";
import { IRequest, IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";

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
