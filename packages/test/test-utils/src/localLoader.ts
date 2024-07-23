/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICodeDetailsLoader,
	IContainer,
	IFluidCodeDetails,
	IHostLoader,
	ILoaderOptions,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { IRequest, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

import { LocalCodeLoader, fluidEntryPoint } from "./localCodeLoader.js";

/**
 * Creates a loader with the given package entries and driver.
 * @param packageEntries - A list of code details to Fluid entry points.
 * @param documentServiceFactory - the driver factory to use
 * @param urlResolver - the url resolver to use
 * @param options - loader options
 * @internal
 */
export function createLoader(
	packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>,
	documentServiceFactory: IDocumentServiceFactory,
	urlResolver: IUrlResolver,
	logger?: ITelemetryBaseLogger,
	options?: ILoaderOptions,
): IHostLoader {
	const codeLoader: ICodeDetailsLoader = new LocalCodeLoader(packageEntries);

	return new Loader({
		urlResolver,
		documentServiceFactory,
		codeLoader,
		logger,
		options,
	});
}

/**
 * Creates a detached Container and attaches it.
 * @param source - The code details used to create the Container.
 * @param loader - The loader to use to initialize the container.
 * @param attachRequest - The request to create new from.
 * @legacy
 * @alpha
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
