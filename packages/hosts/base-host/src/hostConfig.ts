/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";
import {
    ICodeAllowList,
    IProxyLoaderFactory,
    IFluidCodeResolver,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * Host config that contains a url resolver to resolve the url and then provides a
 * list of document service factories from which one can be selected based on protocol
 * of resolved url.
 */
export interface IBaseHostConfig {
    documentServiceFactory: IDocumentServiceFactory;
    urlResolver: IUrlResolver;

    // Any config to be provided to loader.
    options?: ILoaderOptions;

    // A fluid object that gives host provided capabilities/configurations
    // to the Fluid object in the container(such as auth).
    scope?: IFluidObject;

    proxyLoaderFactories?: Map<string, IProxyLoaderFactory>;

    // Allow List for the code loader
    allowList?: ICodeAllowList;

    // The code resolver
    codeResolver: IFluidCodeResolver;
}
