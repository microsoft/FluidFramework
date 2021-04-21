/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";

import {
    DOProviderContainerRuntimeFactory, FluidContainer,
} from "./containerCode";
import { ContainerConfig } from "./types";

/**
 * FluidInstance provides the ability to have a Fluid object with a specific backing server
 */
class FluidInstance {
    private readonly containerService: IGetContainerService;

    public constructor(getContainerService: IGetContainerService) {
        // This check is for non-typescript usages
        if (getContainerService === undefined) {
            throw new Error("Fluid cannot be initialized without a ContainerService");
        }

        this.containerService = getContainerService;
    }

    public async createContainer(id: string, config: ContainerConfig): Promise<FluidContainer> {
        return this.loadContainer(id, config, true);
    }

    public async getContainer(id: string, config: ContainerConfig): Promise<FluidContainer> {
        return this.loadContainer(id, config, false);
    }

    private async loadContainer(id: string, config: ContainerConfig, createNew: boolean): Promise<FluidContainer> {
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(config),
            createNew,
        );
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as FluidContainer;
    }
}

/**
 * Singular global instance that lets the developer define the Fluid server across all instances of Containers.
 */
let globalFluid: FluidInstance | undefined;
export const Fluid = {
    init(getContainerService: IGetContainerService) {
        if (globalFluid) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        globalFluid = new FluidInstance(getContainerService);
    },
    async createContainer(
        id: string, config: ContainerConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to create a container");
        }
        return globalFluid.createContainer(id, config);
    },
    async getContainer(
        id, config: ContainerConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to get a container");
        }
        return globalFluid.getContainer(id, config);
    },
};
