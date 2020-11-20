/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IContainer,
    ILoader,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
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
): ILoader {
    const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
    const codeLoader: ICodeLoader = new LocalCodeLoader(packageEntries);

    return new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });
}

/**
 * Creates a detached Container and attaches it.
 * @param documentId - The documentId for the container.
 * @param source - The code details used to create the Container.
 * @param loader - The loader to use to initialize the container.
 * @param urlresolver - The url resolver to get the create new request from.
 */

export async function createAndAttachContainer(
    documentId: string,
    source: IFluidCodeDetails,
    loader: ILoader,
    urlResolver: IUrlResolver,
): Promise<IContainer> {
    const container = await loader.createDetachedContainer(source);
    const attachUrl = (urlResolver as LocalResolver).createCreateNewRequest(documentId);
    await container.attach(attachUrl);

    return container;
}
