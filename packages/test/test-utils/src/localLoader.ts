/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { initializeContainerCode } from "@fluidframework/base-host";
import {
    ICodeLoader,
    ILoader,
    IFluidCodeDetails,
    IFluidModule,
    IProxyLoaderFactory,
    IProvideRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Loader, Container } from "@fluidframework/container-loader";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { IProvideComponentFactory } from "@fluidframework/runtime-definitions";
import { LocalCodeLoader } from "./localCodeLoader";

/**
 * Creates a loader with the given package entries and a delta connection server.
 * @param packageEntries - A list of code details to fluid entry points.
 * @param deltaConnectionServer - The delta connection server to use as the server.
 */
export function createLocalLoader(
    packageEntries: Iterable<[
        IFluidCodeDetails,
        Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>
    ]>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): ILoader {
    const urlResolver = new LocalResolver();
    const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
    const codeLoader: ICodeLoader = new LocalCodeLoader(packageEntries);

    return new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>());
}

/**
 * Gets and initializes a container with the given code details from the loader.
 * @param documentId - The documentId for the container.
 * @param loader - The loader to use to initialize the container.
 * @param codeDetails - The code details to retrieve the fluid entry point.
 */
export async function initializeLocalContainer(
    documentId: string,
    loader: ILoader,
    codeDetails: IFluidCodeDetails,
): Promise<Container> {
    const container = await loader.resolve({ url: documentId }) as unknown as Container;

    await initializeContainerCode(container, codeDetails);

    // If we're loading from ops, the context might be in the middle of reloading.  Check for that case and wait
    // for the contextChanged event to avoid returning before that reload completes.
    if (container.hasNullRuntime()) {
        await new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));
    }

    return container;
}
