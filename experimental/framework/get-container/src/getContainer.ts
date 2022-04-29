/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainer,
    IFluidModuleWithDetails,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";

export interface IGetContainerParams {
    documentServiceFactory: IDocumentServiceFactory;
    urlResolver: IUrlResolver;
    containerRuntimeFactory: IRuntimeFactory
    request: IRequest;
}

export async function createContainer(
    params: IGetContainerParams,
): Promise<IContainer> {
    const load = async (): Promise<IFluidModuleWithDetails> => {
        return {
            module: { fluidExport: params.containerRuntimeFactory },
            details: { package: "no-dynamic-package", config: {} },
        };
    };

    const codeLoader = { load };
    const loader = new Loader({
        urlResolver: params.urlResolver,
        documentServiceFactory: params.documentServiceFactory,
        codeLoader,
    });

    // We're not actually using the code proposal (our code loader always loads the same module regardless of the
    // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
    // proposal.
    const container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
    await container.attach(params.request);

    return container;
}

export async function getContainer(
    params: IGetContainerParams,
): Promise<IContainer> {
    const load = async (): Promise<IFluidModuleWithDetails> => {
        return {
            module: { fluidExport: params.containerRuntimeFactory },
            details: { package: "no-dynamic-package", config: {} },
        };
    };

    const codeLoader = { load };
    const loader = new Loader({
        urlResolver: params.urlResolver,
        documentServiceFactory: params.documentServiceFactory,
        codeLoader,
    });

    // Request must be appropriate and parseable by resolver.
    const container = await loader.resolve(params.request);

    return container;
}
