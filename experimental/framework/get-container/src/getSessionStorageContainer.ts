/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainer,
    IFluidModuleWithDetails,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { LocalResolver, LocalDocumentServiceFactory, LocalSessionStorageDbFactory } from "@fluidframework/local-driver";

// The deltaConnection needs to be shared across the Loader instances for collaboration to happen
const deltaConnectionMap = new Map<string, ILocalDeltaConnectionServer>();

const urlResolver = new LocalResolver();

/**
 * Connect to the local SessionStorage Fluid service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export async function getSessionStorageContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<IContainer> {
    let deltaConnection = deltaConnectionMap.get(documentId);
    if (deltaConnection === undefined) {
        deltaConnection = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory(documentId));
        deltaConnectionMap.set(documentId, deltaConnection);
    }

    const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnection);
    const url = `${window.location.origin}/${documentId}`;

    // To bypass proposal-based loading, we need a codeLoader that will return our already-in-memory container factory.
    // The expected format of that response is an IFluidModule with a fluidExport.
    const load = async (): Promise<IFluidModuleWithDetails> => {
        return {
            module: { fluidExport: containerRuntimeFactory },
            details: { package: "no-dynamic-package", config: {} },
        };
    };

    const codeLoader = { load };

    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    let container: IContainer;

    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the IContainer will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        container = await loader.createDetachedContainer({ package: "", config: {} });
        await container.attach({ url });
    } else {
        container = await loader.resolve({ url });
    }

    return container;
}
