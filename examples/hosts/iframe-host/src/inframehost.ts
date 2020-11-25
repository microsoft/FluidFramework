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
import { IProxyLoaderFactory } from "@fluidframework/container-definitions";
import {
    MultiDocumentServiceFactory,
    MultiUrlResolver,
} from "@fluidframework/driver-utils";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";

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

export class IFrameOuterHost {
    constructor(private readonly hostConfig: IFrameOuterHostConfig) {
        // todo
        // disable summaries
        // set as non-user client
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
}
