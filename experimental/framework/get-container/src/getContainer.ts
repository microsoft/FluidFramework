/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";

export interface IGetContainerConfig {
    containerId: string;
}

export interface IGetContainerService {
    documentServiceFactory: IDocumentServiceFactory;
    urlResolver: IUrlResolver;
    /**
     * This is called for preparing the request that will be passed to getContainer in the create new container flow
     * @param config Configuration specific to the container's metadata and the Fluid service being used
     */
    generateCreateNewRequest(config: IGetContainerConfig): IRequest;
    /**
     * This is called for preparing the request that will be passed to getContainer in the load existing container flow
     * @param config Configuration specific to the container's metadata and the Fluid service being used
     */
    generateLoadExistingRequest(config: IGetContainerConfig): IRequest;
}

export async function getContainer(
    getContainerService: IGetContainerService,
    containerConfig: IGetContainerConfig,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<Container> {
    const module = { fluidExport: containerRuntimeFactory };
    const codeLoader = { load: async () => module };

    const loader = new Loader({
        urlResolver: getContainerService.urlResolver,
        documentServiceFactory: getContainerService.documentServiceFactory,
        codeLoader,
    });

    let container: Container;

    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        const request = getContainerService.generateCreateNewRequest(containerConfig);
        container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
        await container.attach(request);
    } else {
        const request = getContainerService.generateLoadExistingRequest(containerConfig);
        // Request must be appropriate and parseable by resolver.
        container = await loader.resolve(request);
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!container.existing) {
            throw new Error("Attempted to load a non-existing container");
        }
    }
    return container;
}
