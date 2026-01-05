/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest } from "@fluidframework/core-interfaces";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/driver-definitions/internal";

/**
 * The collection of per-service functionality required to create and/or load a Fluid container.
 */
export interface ExampleDriver {
	/**
	 * The url resolver for the service.
	 */
	urlResolver: IUrlResolver;
	/**
	 * The document service factory for the service.
	 */
	documentServiceFactory: IDocumentServiceFactory;
	/**
	 * Create a request to be used when calling container.attach().
	 *
	 * @remarks
	 * Not all services respect the passed id parameter. T9s will ignore it and generate
	 * an id that will be provided in the response (and is discoverable from the container's
	 * resolvedUrl post-attach).
	 */
	createCreateNewRequest: (id: string) => IRequest;
	/**
	 * Create a request to be used when calling loadExistingContainer().
	 *
	 * @privateRemarks
	 * Odsp currently requires this to be async because it needs to make a network call to
	 * match the file name to the driveId/itemId needed in the URL.
	 */
	createLoadExistingRequest: (id: string) => Promise<IRequest>;
}

/**
 * The supported services for the example driver.
 */
export type ExampleDriverService = "odsp" | "t9s" | "local";

export const isExampleDriverService = (value: unknown): value is ExampleDriverService =>
	typeof value === "string" && ["odsp", "t9s", "local"].includes(value);
