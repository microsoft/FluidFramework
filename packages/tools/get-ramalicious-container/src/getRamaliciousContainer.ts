/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { LocalResolver } from "@fluidframework/local-driver";

/**
 * Connect to the Ram-a-licious service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export async function getRamaliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<Container> {
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        undefined,
    );

    const urlResolver = new LocalResolver();

    // To bypass proposal-based loading, we need a codeLoader that will return our already-in-memory container factory.
    // The expected format of that response is an IFluidModule with a fluidExport.
    const module = { fluidExport: containerRuntimeFactory };
    const codeLoader = { load: async () => module };

    const loader = new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        { blockUpdateMarkers: true },
        {},
        new Map(),
    );

    let container: Container;

    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        container = await loader.createDetachedContainer({ package: "", config: {} });
        await container.attach({ url: documentId });
    } else {
        // The InsecureTinyliciousUrlResolver expects the url of the request to be the documentId.
        container = await loader.resolve({ url: documentId });
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        if (!container.existing) {
            throw new Error("Attempted to load a non-existing container");
        }
    }

    return container;
}
