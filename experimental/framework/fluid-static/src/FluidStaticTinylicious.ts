/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITinyliciousServiceConfig,
    TinyliciousService,
} from "@fluid-experimental/get-container";
import { Container } from "@fluidframework/container-loader";
import {
    DOProviderContainerRuntimeFactory,
    FluidContainer,
} from "./containerCode";
import { ContainerConfig } from "./types";

/**
 * FluidTinyliciousInstance provides the ability to have a Fluid object backed by a Tinylicious service
 */
export class FluidTinyliciousInstance {
    private readonly containerService: TinyliciousService;

    public constructor(port?: number) {
        this.containerService = new TinyliciousService(port);
    }

    public async createContainer(
        serviceConfig: ITinyliciousServiceConfig,
        objectConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            objectConfig,
        );
        const container = await this.containerService.createContainer(
            serviceConfig,
            runtimeFactory,
        );
        return this.getRootDataObject(container);
    }

    public async getContainer(
        serviceConfig: ITinyliciousServiceConfig,
        objectConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            objectConfig,
        );
        const container = await this.containerService.getContainer(
            serviceConfig,
            runtimeFactory,
        );
        return this.getRootDataObject(container);
    }

    private async getRootDataObject(
        container: Container,
    ): Promise<FluidContainer> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as FluidContainer;
    }
}

/**
 * Singular global instance that lets the developer define all Container interactions with the Tinylicious service
 */
let globalFluidTinylicious: FluidTinyliciousInstance | undefined;
export const FluidTinylicious = {
    init(tinyliciousPort?: number) {
        if (globalFluidTinylicious) {
            throw new Error("FluidTinylicious cannot be initialized more than once");
        }
        globalFluidTinylicious = new FluidTinyliciousInstance(tinyliciousPort);
    },
    async createContainer(
        serviceConfig: ITinyliciousServiceConfig,
        objectConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        if (!globalFluidTinylicious) {
            throw new Error(
                "FluidTinylicious has not been properly initialized before attempting to create a container",
            );
        }
        return globalFluidTinylicious.createContainer(
            serviceConfig,
            objectConfig,
        );
    },
    async getContainer(
        serviceConfig: ITinyliciousServiceConfig,
        objectConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        if (!globalFluidTinylicious) {
            throw new Error(
                "FluidTinylicious has not been properly initialized before attempting to get a container",
            );
        }
        return globalFluidTinylicious.getContainer(serviceConfig, objectConfig);
    },
};
