/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";
import { ICodeAllowList, IProxyLoaderFactory, IFluidCodeResolver } from "@fluidframework/container-definitions";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * Host config that contains a url resolver to resolve the url and then provides a
 * list of document service factories from which one can be selected based on protocol
 * of resolved url.
 */
export interface IBaseHostConfig {
    documentServiceFactory: IDocumentServiceFactory | IDocumentServiceFactory[];
    urlResolver: IUrlResolver | IUrlResolver[];

    // Any config to be provided to loader.
    config?: any;

    // A component that gives host provided capabilities/configurations
    // to the component in the container(such as auth).
    scope?: IFluidObject & IFluidObject;

    proxyLoaderFactories?: Map<string, IProxyLoaderFactory>;

    // Allow List for the code loader
    allowList?: ICodeAllowList;

    // The code resolver
    codeResolver: IFluidCodeResolver;
}
