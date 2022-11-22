/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IContainer,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
    createTinyliciousCreateNewRequest,
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import { createContainer, getContainer } from "./getContainer";

/**
 * Connect to the Tinylicious service and retrieve a container with the given ID running the given code.
 *
 * @param documentId - The document id to retrieve (only used when `createNew` is false).
 * @param containerRuntimeFactory - The container factory to be loaded in the container.
 * @param createNew - A flag indicating whether a new container should be created.
 * @param tinyliciousPort - An optional port to connect to the tinylicious server.
 * When not provided, the default port 7070 will be used.
 *
 * @returns - A tuple of the container instance and the container ID associated with it.
 */
export async function getTinyliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
    tinyliciousPort?: number,
): Promise<[IContainer, string]> {
    const tokenProvider = new InsecureTinyliciousTokenProvider();
    const urlResolver = new InsecureTinyliciousUrlResolver(tinyliciousPort);
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    const container = await (createNew
        ? createContainer({
            documentServiceFactory,
            urlResolver,
            containerRuntimeFactory,
            request: createTinyliciousCreateNewRequest(),
        }) : getContainer({
            documentServiceFactory,
            urlResolver,
            containerRuntimeFactory,
            request: { url: documentId },
        }));
    const resolved = container.resolvedUrl;
    ensureFluidResolvedUrl(resolved);
    const containerId = resolved.id;
    return [container, containerId];
}
