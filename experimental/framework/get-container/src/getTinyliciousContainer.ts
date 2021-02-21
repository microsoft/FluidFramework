/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainer,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureTinyliciousTokenProvider, InsecureTinyliciousUrlResolver } from "@fluidframework/tinylicious-driver";
import { getContainer, IGetContainerService } from "./getContainer";

export class TinyliciousService implements IGetContainerService {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver = new InsecureTinyliciousUrlResolver();

    constructor() {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    }
}

/**
 * Connect to the Tinylicious service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export async function getTinyliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<IContainer> {
    const tinyliciousService = new TinyliciousService();

    return getContainer(
        tinyliciousService.urlResolver,
        tinyliciousService.documentServiceFactory,
        documentId,
        createNew,
        containerRuntimeFactory,
    );
}
