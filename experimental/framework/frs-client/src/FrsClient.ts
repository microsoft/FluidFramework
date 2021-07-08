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
} from "@fluid-experimental/fluid-framework";
import {
    IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import {
    FrsConnectionConfig,
    FrsContainerConfig,
    FrsContainerServices,
    FrsResources,
} from "./interfaces";
import { FrsAudience } from "./FrsAudience";
import { FrsUrlResolver } from "./FrsUrlResolver";

/**
 * FrsClient provides the ability to have a Fluid object backed by the FRS service or, when running with
 * local tenantId, have it be backed by a Tinylicious local service instance
 */
export class FrsClient {
    public readonly documentServiceFactory: IDocumentServiceFactory;

    constructor(private readonly connectionConfig: FrsConnectionConfig) {
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            this.connectionConfig.tokenProvider,
        );
    }

    public async createContainer(
        containerConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FrsResources> {
        const loader = this.createLoader(containerConfig, containerSchema);
        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });
        await container.attach({ url: containerConfig.id });
        return this.getFluidContainerAndServices(container);
    }

    public async getContainer(
        containerConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FrsResources> {
        const loader = this.createLoader(containerConfig, containerSchema);
        const container = await loader.resolve({ url: containerConfig.id });
        return this.getFluidContainerAndServices(container);
    }

    private async getFluidContainerAndServices(
        container: Container,
    ): Promise<FrsResources> {
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer: FluidContainer = new FluidContainer(container, rootDataObject);
        const containerServices: FrsContainerServices = this.getContainerServices(container);
        const frsResources: FrsResources = { fluidContainer, containerServices };
        return frsResources;
    }

    private getContainerServices(
        container: Container,
    ): FrsContainerServices {
        return {
            audience: new FrsAudience(container),
        };
    }

    private createLoader(
        containerConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
    ): Loader {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const module = { fluidExport: runtimeFactory };
        const codeLoader = { load: async () => module };
        const urlResolver = new FrsUrlResolver(
            this.connectionConfig.tenantId,
            this.connectionConfig.orderer,
            this.connectionConfig.storage,
            containerConfig.id,
            this.connectionConfig.tokenProvider,
        );
        return new Loader({
            urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: containerConfig.logger,
        });
    }
}
