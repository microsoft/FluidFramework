/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeLoader,
    IContainer,
    IHostLoader,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails, IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { fluidEntryPoint, LocalCodeLoader } from "./localCodeLoader";

/**
 * Creates a loader with the given package entries and driver.
 * @param packageEntries - A list of code details to Fluid entry points.
 * @param documentServiceFactory - the driver factory to use
 * @param urlResolver - the url resolver to use
 * @param options - loader options
 */
export function createLoader(
    packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
    documentServiceFactory: IDocumentServiceFactory,
    urlResolver: IUrlResolver,
    options?: ILoaderOptions,
): IHostLoader {
    const codeLoader: ICodeLoader = new LocalCodeLoader(packageEntries);

    // TODO: some tests is table are using this, and not properly using mocha hooks,
    // so the tests break if we don't null check here
    const driver = typeof getFluidTestDriver === "function" ? getFluidTestDriver() : undefined;
    const logger = typeof getTestLogger === "function" ? getTestLogger() : undefined;

    return new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
        logger: ChildLogger.create(logger, undefined, {driverType: driver?.type}),
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
    loader: IHostLoader,
    attachRequest: IRequest,
): Promise<IContainer> {
    const container = await loader.createDetachedContainer(source);
    await container.attach(attachRequest);

    return container;
}
