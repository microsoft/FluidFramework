/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureTinyliciousTokenProvider, InsecureTinyliciousUrlResolver } from "@fluidframework/tinylicious-driver";
import { getContainer } from "./getContainer";
/**
 * Connect to the Tinylicious service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export async function getTinyliciousContainer(documentId, containerRuntimeFactory, createNew) {
    const tokenProvider = new InsecureTinyliciousTokenProvider();
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    const urlResolver = new InsecureTinyliciousUrlResolver();
    return getContainer(documentId, createNew, { url: documentId }, urlResolver, documentServiceFactory, containerRuntimeFactory);
}
//# sourceMappingURL=getTinyliciousContainer.js.map