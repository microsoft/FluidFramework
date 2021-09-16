/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { v4 as uuid } from "uuid";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import {
    ContainerSchema,
    DOProviderContainerRuntimeFactory,
    FluidContainer,
    IFluidContainer,
    RootDataObject,
} from "@fluidframework/fluid-static";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import {
    AzureClientProps,
    AzureContainerServices,
} from "./interfaces";
import { AzureAudience } from "./AzureAudience";
import { AzureUrlResolver } from "./AzureUrlResolver";

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Relay Service or,
 * when running with local tenantId, have it be backed by a Tinylicious local service instance
 */
export class AzureClient {
    private readonly documentServiceFactory: IDocumentServiceFactory;

    /**
     * Creates a new client instance using configuration parameters.
     * @param props - Properties for initializing a new AzureClient instance
     */
    constructor(private readonly props: AzureClientProps) {
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            this.props.connection.tokenProvider,
            { enableWholeSummaryUpload: true },
        );
    }

    /**
     * Creates a new detached container instance in the Azure Relay Service.
     * @param containerSchema - Container schema for the new container.
     * @returns New detached container instance along with associated services.
     */
    public async createContainer(
        containerSchema: ContainerSchema,
    ): Promise<{ container: IFluidContainer; services: AzureContainerServices }> {
        const loader = this.createLoader(containerSchema);
        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });
        // temporarily we'll generate the new container ID here
        // until container ID changes are settled in lower layers.
        const id = uuid();
        return this.getFluidContainerAndServices(id, container);
    }

    /**
     * Accesses the existing container given its unique ID in the Azure Fluid Relay service.
     * @param id - Unique ID of the container in Azure Fluid Relay service
     * @param containerSchema - Container schema used to access data objects in the container.
     * @returns Existing container instance along with associated services.
     */
    public async getContainer(
        id: string,
        containerSchema: ContainerSchema,
    ): Promise<{ container: IFluidContainer; services: AzureContainerServices }> {
        const loader = this.createLoader(containerSchema);
        const container = await loader.resolve({ url: id });
        return this.getFluidContainerAndServices(id, container);
    }

    // #region private
    private async getFluidContainerAndServices(
        id: string,
        container: Container,
    ): Promise<{ container: IFluidContainer; services: AzureContainerServices }> {
        const attach = async () => {
            await container.attach({ url: id });
            return id;
        };
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer: IFluidContainer = new FluidContainer(container, rootDataObject, attach);
        const services: AzureContainerServices = this.getContainerServices(container);
        return { container: fluidContainer, services };
    }

    private getContainerServices(
        container: Container,
    ): AzureContainerServices {
        return {
            audience: new AzureAudience(container),
        };
    }

    private createLoader(
        containerSchema: ContainerSchema,
    ): Loader {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const module = { fluidExport: runtimeFactory };
        const codeLoader = { load: async () => module };
        const urlResolver = new AzureUrlResolver(
            this.props.connection.tenantId,
            this.props.connection.orderer,
            this.props.connection.storage,
            this.props.connection.tokenProvider,
        );
        return new Loader({
            urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: this.props.logger,
        });
    }
    // #endregion
}
