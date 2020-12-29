/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { getContainer } from "./getContainer";
import { InsecureTinyliciousTokenProvider } from "./insecureTinyliciousTokenProvider";
import { InsecureTinyliciousUrlResolver } from "./insecureTinyliciousUrlResolver";
/**
 * Connect to the Tinylicious service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export async function getTinyliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<Container> {
    const tokenProvider = new InsecureTinyliciousTokenProvider();
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);

    const urlResolver = new InsecureTinyliciousUrlResolver();

    return getContainer(
        documentId,
        createNew,
        { url: documentId },
        urlResolver,
        documentServiceFactory,
        containerRuntimeFactory,
    );
}
