/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IGetContainerService,
} from "@fluid-experimental/get-container";
import { Container } from "@fluidframework/container-loader";

import {
    DOProviderContainerRuntimeFactory,
    FluidContainer,
} from "./containerCode";
import { ContainerConfig } from "./types";

/**
 * FluidInstance provides the ability to have a Fluid object with a specific backing server
 */
export class FluidInstance {
    private readonly containerService: IGetContainerService;

    public constructor(getContainerService: IGetContainerService) {
        // This check is for non-typescript usages
        if (getContainerService === undefined) {
            throw new Error(
                "Fluid cannot be initialized without a ContainerService",
            );
        }

        this.containerService = getContainerService;
    }

    public async createContainer(
        fileConfig: any,
        containerConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(containerConfig);
        const container = await this.containerService.createContainer(
            fileConfig,
            runtimeFactory,
        );
        return this.getRootDataObject(container);
    }

    public async getContainer(
        fileConfig: any,
        containerConfig: ContainerConfig,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(containerConfig);
        const container =  await this.containerService.getContainer(fileConfig, runtimeFactory);
        return this.getRootDataObject(container);
    }

    private async getRootDataObject(
        container: Container,
    ): Promise<FluidContainer> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as FluidContainer;
    }
}
