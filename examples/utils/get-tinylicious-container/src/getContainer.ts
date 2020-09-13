/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";

export async function getContainer(
    documentId: string,
    createNew: boolean,
    request: IRequest,
    urlResolver: IUrlResolver,
    documentServiceFactory: IDocumentServiceFactory,
    containerRuntimeFactory: IRuntimeFactory,
): Promise<Container> {
    const module = { fluidExport: containerRuntimeFactory };
    const codeLoader = { load: async () => module };

    const loader = new Loader (
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
        container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
        await container.attach({ url: documentId });
    } else {
        // Request must be appropriate and parseable by resolver.
        container = await loader.resolve(request);
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        if (!container.existing) {
            throw new Error("Attempted to load a non-existing container");
        }
    }
    return container;
}
