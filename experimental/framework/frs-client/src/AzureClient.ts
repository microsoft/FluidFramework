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
    AzureConnectionConfig,
    AzureContainerConfig,
    AzureContainerServices,
    AzureResources,
} from "./interfaces";
import { AzureAudience } from "./AzureAudience";
import { AzureUrlResolver } from "./AzureUrlResolver";

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Relay Service or,
 * when running with local tenantId, have it be backed by a Tinylicious local service instance
 */
export class AzureClient {
    public readonly documentServiceFactory: IDocumentServiceFactory;

    constructor(private readonly connectionConfig: AzureConnectionConfig) {
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            this.connectionConfig.tokenProvider,
        );
    }

    public async createContainer(
        containerConfig: AzureContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<AzureResources> {
        const loader = this.createLoader(containerConfig, containerSchema);
        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });
        await container.attach({ url: containerConfig.id });
        return this.getFluidContainerAndServices(container);
    }

    public async getContainer(
        containerConfig: AzureContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<AzureResources> {
        const loader = this.createLoader(containerConfig, containerSchema);
        const container = await loader.resolve({ url: containerConfig.id });
        return this.getFluidContainerAndServices(container);
    }

    private async getFluidContainerAndServices(
        container: Container,
    ): Promise<AzureResources> {
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer: FluidContainer = new FluidContainer(container, rootDataObject);
        const containerServices: AzureContainerServices = this.getContainerServices(container);
        const frsResources: AzureResources = { fluidContainer, containerServices };
        return frsResources;
    }

    private getContainerServices(
        container: Container,
    ): AzureContainerServices {
        return {
            audience: new AzureAudience(container),
        };
    }

    private createLoader(
        containerConfig: AzureContainerConfig,
        containerSchema: ContainerSchema,
    ): Loader {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const module = { fluidExport: runtimeFactory };
        const codeLoader = { load: async () => module };
        const urlResolver = new AzureUrlResolver(
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
