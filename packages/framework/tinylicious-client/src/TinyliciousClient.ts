/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { v4 as uuid } from "uuid";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    ContainerSchema,
    DOProviderContainerRuntimeFactory,
    FluidContainer,
    RootDataObject,
} from "fluid-framework";
import {
    TinyliciousConnectionConfig,
    TinyliciousContainerServices,
    TinyliciousResources,
} from "./interfaces";
import { TinyliciousAudience } from "./TinyliciousAudience";

/**
 * TinyliciousClient provides the ability to have a Fluid object backed by a Tinylicious service
 */
export class TinyliciousClient {
    private readonly documentServiceFactory: IDocumentServiceFactory;
    private readonly urlResolver: IUrlResolver;

    /**
     * Creates a new client instance using configuration parameters.
     * @param connectionConfig - Optional. Configuration parameters to override default connection settings.
     * @param logger - Optional. A logger instance to receive diagnostic messages.
     */
     constructor(
        serviceConnectionConfig?: TinyliciousConnectionConfig,
        private readonly logger?: ITelemetryBaseLogger,
    ) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(
            serviceConnectionConfig?.port,
            serviceConnectionConfig?.domain,
        );
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    /**
     * Creates a new container instance in Tinylicious server.
     * @param containerSchema - Container schema for the new container.
     * @returns New container instance along with associated services.
     */
     public async createContainer(
        containerSchema: ContainerSchema,
    ): Promise<TinyliciousResources> {
        // temporarily we'll generate the new container ID here
        // until container ID changes are settled in lower layers.
        const id = uuid();
        const container = await this.getContainerCore(id, containerSchema, true);
        return this.getFluidContainerAndServices(id, container);
    }

    /**
     * Acesses the existing container given its unique ID in the tinylicious server.
     * @param id - Unique ID of the container.
     * @param containerSchema - Container schema used to access data objects in the container.
     * @returns Existing container instance along with associated services.
     */
     public async getContainer(
        id: string,
        containerSchema: ContainerSchema,
    ): Promise<TinyliciousResources> {
        const container = await this.getContainerCore(id, containerSchema);
        return this.getFluidContainerAndServices(id, container);
    }

    // #region private
    private async getFluidContainerAndServices(
        id: string,
        container: Container,
    ): Promise<TinyliciousResources> {
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer: FluidContainer = new FluidContainer(id, container, rootDataObject);
        const containerServices: TinyliciousContainerServices = this.getContainerServices(container);
        const tinyliciousResources: TinyliciousResources = { fluidContainer, containerServices };
        return tinyliciousResources;
    }

    private getContainerServices(
        container: Container,
    ): TinyliciousContainerServices {
        return {
            audience: new TinyliciousAudience(container),
        };
    }

    private async getContainerCore(
        id: string,
        containerSchema: ContainerSchema,
        createNew?: boolean,
    ): Promise<Container> {
        const containerRuntimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const module = { fluidExport: containerRuntimeFactory };
        const codeLoader = { load: async () => module };

        const loader = new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: this.logger,
        });

        let container: Container;

        if (createNew === true) {
            // We're not actually using the code proposal (our code loader always loads the same module
            // regardless of the proposal), but the Container will only give us a NullRuntime if there's
            // no proposal.  So we'll use a fake proposal.
            container = await loader.createDetachedContainer({
                package: "no-dynamic-package",
                config: {},
            });
            await container.attach({ url: id });
        } else {
            // Request must be appropriate and parseable by resolver.
            container = await loader.resolve({ url: id });
        }
        return container;
    }
    // #endregion
}
