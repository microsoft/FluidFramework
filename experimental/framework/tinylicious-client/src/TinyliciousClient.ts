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

    /**
     * Create and attach a new container based on the schema and configuration provided. The container
     * schema is used to build the initial container and it is immediately attached based on the config
     * parameters provided
     * @param serviceContainerConfig - Tinylicious specific configuration for how the container's data will be stored
     * @param containerSchema - Schema holding the definitions for the DDSes and data objects that are supported by
     * this container
     */
    public async createAttachedContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer<TinyliciousContainerConfig>> {
        const fluidContainer = await this.createDetachedContainer(containerSchema);
        await fluidContainer.attachToService(serviceContainerConfig);
        return fluidContainer;
    }

    /**
     * Create a deteached container based on only the schema, no config is required. The container schema is used to build 
     * the initial container and it is returned with no persistence yet on the service. Note that the data will not be saved
     * in the detached state. You can choose to attach the container later in the application's lifetime using the
     * FluidContainer's attachToService call and provide the container configuration at that time.
     * @param containerSchema - Schema holding the definitions for the DDSes and data objects that are supported by
     * this container
     */
    public async createDetachedContainer(
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer<TinyliciousContainerConfig>> {
        const loader = await this.getLoader(containerSchema);

        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });

        const rootDataObject = await this.getRootDataObject(container);
        return this.generateFluidContainer(rootDataObject, container);
    }

    /**
     * Get an existing container based on the schema and configuration provided. The container configuration is used to
     * navigate to the data backing the container on the service, whereas the container schema will be used to prepare the
     * runtime to load that data into the appropriate DDSes and data objects in the container.
     * @param serviceContainerConfig - Tinylicious specific configuration for how the container's data will be stored
     * @param containerSchema - Schema holding the definitions for the DDSes and data objects that are supported by
     * this container
     */
    public async getContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer<TinyliciousContainerConfig>> {
        const loader = await this.getLoader(containerSchema);
        const container = await loader.resolve({ url: serviceContainerConfig.id });
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        if (container.existing === undefined) {
            throw new Error("Attempted to load a non-existing container");
        }
        const rootDataObject = await this.getRootDataObject(container);
        return this.generateFluidContainer(rootDataObject, container);
    }

    private async getRootDataObject(
        container: Container,
    ): Promise<RootDataObject> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as RootDataObject;
    }

    private async getLoader(
        containerSchema: ContainerSchema,
    ): Promise<Loader> {
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

    private generateFluidContainer(
        rootDataObject: RootDataObject,
        container: Container,
    ) {
        return new FluidContainer(rootDataObject, container, this.attachTinyliciousContainer.bind(this));
    }

    private async attachTinyliciousContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        container: Container,
    ): Promise<void> {
        const request = { url: serviceContainerConfig.id };
        await container.attach(request);
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
    ): Promise<FluidContainer<TinyliciousContainerConfig>> {
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
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer<TinyliciousContainerConfig>> {
        if (!globalTinyliciousClient) {
            throw new Error(
                "TinyliciousClient has not been properly initialized before attempting to create a container",
            );
        }
        return globalTinyliciousClient.createDetachedContainer(
            objectConfig,
        );
    },
    async getContainer(
        serviceConfig: TinyliciousContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer<TinyliciousContainerConfig>> {
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
