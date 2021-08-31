/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Container, Loader } from "@fluidframework/container-loader";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import {
    ContainerSchema,
    DOProviderContainerRuntimeFactory,
    FluidContainer,
    RootDataObject,
} from "fluid-framework";

import {
    AzureConnectionConfig,
    AzureContainerServices,
} from "./interfaces";
import { AzureAudience } from "./AzureAudience";
import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver";

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Relay Service or,
 * when running with local tenantId, have it be backed by a Tinylicious local service instance
 */
export class AzureClient {
    private readonly documentServiceFactory: IDocumentServiceFactory;

    /**
     * Creates a new client instance using configuration parameters.
     * @param connectionConfig - Configuration parameters needed to establish a connection with the Azure Relay Service.
     * @param logger - Optional. A logger instance to receive diagnostic messages.
     */
    constructor(
        private readonly connectionConfig: AzureConnectionConfig,
        private readonly logger?: ITelemetryBaseLogger,
    ) {
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            this.connectionConfig.tokenProvider,
        );
    }

    /**
     * Creates a new detached container instance in the Azure Relay Service.
     * @param containerSchema - Container schema for the new container.
     * @returns New detached container instance along with associated services.
     */
    public async createContainer(
        containerSchema: ContainerSchema,
    ): Promise<{ container: FluidContainer; services: AzureContainerServices }> {
        const loader = this.createLoader(containerSchema);

        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });

        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");

        const fluidContainer = new (class extends FluidContainer {
            async attach() {
                if (this.attachState !== AttachState.Detached) {
                    throw new Error("Cannot attach container. Container is not in detached state");
                }
                const request = createAzureCreateNewRequest();
                const resolved = await container.attach(request);
                ensureFluidResolvedUrl(resolved);
                return resolved.id;
            }
        })(container, rootDataObject);

        const services = this.getContainerServices(container);
        return { container: fluidContainer, services };
    }

    /**
     * Acesses the existing container given its unique ID in the Azure Fluid Relay service.
     * @param id - Unique ID of the container in Azure Fluid Relay service
     * @param containerSchema - Container schema used to access data objects in the container.
     * @returns Existing container instance along with associated services.
     */
    public async getContainer(
        id: string,
        containerSchema: ContainerSchema,
    ): Promise<{ container: FluidContainer; services: AzureContainerServices }> {
        const loader = this.createLoader(containerSchema);
        const container = await loader.resolve({ url: id });

        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer = new FluidContainer(container, rootDataObject);
        const services = this.getContainerServices(container);
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
            this.connectionConfig.tenantId,
            this.connectionConfig.orderer,
            this.connectionConfig.storage,
        );
        return new Loader({
            urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: this.logger,
        });
    }
    // #endregion
}
