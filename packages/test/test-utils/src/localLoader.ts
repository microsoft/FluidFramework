/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IContainer,
    ILoader,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails, IRequest } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";

/**
 * Creates a loader with the given package entries and a delta connection server.
 * @param packageEntries - A list of code details to Fluid entry points.
 * @param deltaConnectionServer - The delta connection server to use as the server.
 */
export function createLocalLoader(
    packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
    options?: ILoaderOptions,
): ILoader {
    const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
    const codeLoader: ICodeLoader = new LocalCodeLoader(packageEntries);

    return new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
        options,
    });
}

/**
 * Creates a detached Container and attaches it.
 * @param source - The code details used to create the Container.
 * @param loader - The loader to use to initialize the container.
 * @param attachRequest - The request to create new from.
 */

export async function createAndAttachContainer(
    source: IFluidCodeDetails,
    loader: ILoader,
    attachRequest: IRequest,
): Promise<IContainer> {
    const container = await loader.createDetachedContainer(source);
    await container.attach(attachRequest);

    return container;
}
