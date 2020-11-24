/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import {
    DocumentServiceFactoryProxy,
    IDocumentServiceFactoryProxyKey,
    IUrlResolverProxyKey,
    OuterUrlResolver,
} from "@fluidframework/iframe-driver";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    ICodeLoader,
    IProxyLoaderFactory,
} from "@fluidframework/container-definitions";
import {
    MultiDocumentServiceFactory,
    MultiUrlResolver,
} from "@fluidframework/driver-utils";
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

    public async getContainerForRequest(request: IRequest): Promise<Container> {
        return this.loader.resolve(request);
    }
}
