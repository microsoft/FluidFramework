/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainer,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";

export interface ITinyliciousServiceConfig {
    id: string;
}

export class TinyliciousService implements IGetContainerService {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver;

    constructor(tinyliciousPort?: number) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(tinyliciousPort);
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    public async createContainer(
        serviceConfig: ITinyliciousServiceConfig,
        containerRuntimeFactory: IRuntimeFactory,
    ): Promise<Container> {
        return getContainer(this, serviceConfig.id, containerRuntimeFactory, true);
    }

    public async getContainer(
        serviceConfig: ITinyliciousServiceConfig,
        containerRuntimeFactory: IRuntimeFactory,
    ): Promise<Container> {
        return getContainer(
            this,
            serviceConfig.id,
            containerRuntimeFactory,
            false,
        );
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
    tinyliciousPort?: number,
): Promise<IContainer> {
    const service = new TinyliciousService(tinyliciousPort);

    return getContainer(
        service,
        documentId,
        containerRuntimeFactory,
        createNew,
    );
}
