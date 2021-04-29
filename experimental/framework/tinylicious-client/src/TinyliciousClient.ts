/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container, Loader } from "@fluidframework/container-loader";
import {
    ContainerSchema,
    DOProviderContainerRuntimeFactory,
    FluidContainer,
    RootDataObject,
} from "@fluid-experimental/fluid-static";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import {
    TinyliciousConnectionConfig,
    TinyliciousContainerConfig,
} from "./interfaces";

/**
 * TinyliciousClientInstance provides the ability to have a Fluid object backed by a Tinylicious service
 */
export class TinyliciousClientInstance {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver;

    constructor(serviceConnectionConfig?: TinyliciousConnectionConfig) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(
            serviceConnectionConfig?.port,
        );
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    public async createAttachedContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer> {
        const fluidContainer = await this.createDetachedContainer(serviceContainerConfig, containerSchema);
        await fluidContainer.attachToService();
        return fluidContainer;
    }

    public async createDetachedContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer> {
        const loader = await this.getLoader(containerSchema);

        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });

        const rootDataObject = await this.getRootDataObject(container);
        return new FluidContainer(rootDataObject, container, { url: serviceContainerConfig.id });
    }

    public async getContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer> {
        const loader = await this.getLoader(containerSchema);
        const container = await loader.resolve({ url: serviceContainerConfig.id });
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        if (container.existing === undefined) {
            throw new Error("Attempted to load a non-existing container");
        }
        const rootDataObject = await this.getRootDataObject(container);
        return new FluidContainer(rootDataObject, container, { url: serviceContainerConfig.id });
    }

    private async getRootDataObject(
        container: Container,
    ): Promise<RootDataObject> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as RootDataObject;
    }

    private async getLoader(
        containerSchema: ContainerSchema,
    ) {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );

        const module = { fluidExport: runtimeFactory };
        const codeLoader = { load: async () => module };

        const loader = new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
        });
        return loader;
    }
}

/**
 * Singular global instance that lets the developer define all Container interactions with the Tinylicious service
 */
let globalTinyliciousClient: TinyliciousClientInstance | undefined;
export const TinyliciousClient = {
    init(serviceConnectionConfig?: TinyliciousConnectionConfig) {
        if (globalTinyliciousClient) {
            throw new Error(
                "TinyliciousClient cannot be initialized more than once",
            );
        }
        globalTinyliciousClient = new TinyliciousClientInstance(
            serviceConnectionConfig,
        );
    },
    async createAttachedContainer(
        serviceConfig: TinyliciousContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer> {
        if (!globalTinyliciousClient) {
            throw new Error(
                "TinyliciousClient has not been properly initialized before attempting to create a container",
            );
        }
        return globalTinyliciousClient.createAttachedContainer(
            serviceConfig,
            objectConfig,
        );
    },
    async createDetachedContainer(
        serviceConfig: TinyliciousContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer> {
        if (!globalTinyliciousClient) {
            throw new Error(
                "TinyliciousClient has not been properly initialized before attempting to create a container",
            );
        }
        return globalTinyliciousClient.createDetachedContainer(
            serviceConfig,
            objectConfig,
        );
    },
    async getContainer(
        serviceConfig: TinyliciousContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer> {
        if (!globalTinyliciousClient) {
            throw new Error(
                "TinyliciousClient has not been properly initialized before attempting to get a container",
            );
        }
        return globalTinyliciousClient.getContainer(
            serviceConfig,
            objectConfig,
        );
    },
};
