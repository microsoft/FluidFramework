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
import { TinyliciousClient, TinyliciousResources } from "@fluid-experimental/tinylicious-client";
import {
    IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import { ITokenProvider, RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { generateUser } from "@fluidframework/server-services-client";
import {
    FrsConnectionConfig,
    FrsConnectionCoreConfig,
    FrsContainerConfig,
    FrsContainerServices,
    FrsResources,
} from "./interfaces";
import { FrsAudience } from "./FrsAudience";
import { FrsUrlResolver } from "./FrsUrlResolver";

/**
 * Core class for the FrsClient that specifically focuses on its ability to communicate with the FRS service
 */
export class FrsClientCore {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly tokenProvider: ITokenProvider;
    constructor(private readonly connectionConfig: FrsConnectionCoreConfig) {
        const user = this.connectionConfig.user
            ? { id: this.connectionConfig.user.userId, name: this.connectionConfig.user.userName }
            : generateUser();
        this.tokenProvider = connectionConfig.type === "tokenProvider"
            ? connectionConfig.tokenProvider
            : new InsecureTokenProvider(connectionConfig.key, user);
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            this.tokenProvider,
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
        if (container.existing !== true) {
            throw new Error("Attempted to load a non-existing container");
        }
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
            this.tokenProvider,
        );
        return new Loader({
            urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: containerConfig.logger,
        });
    }
}

/**
 * FrsClient provides the ability to have a Fluid object backed by the FRS service or, when running with
 * localMode enabled, have it be backed by Tinylicious locally
 */
export class FrsClient {
    private readonly clientInstance: FrsClientCore | TinyliciousClient;

    constructor(private readonly connectionConfig: FrsConnectionConfig) {
        if (connectionConfig.type === "localMode") {
            this.clientInstance = new TinyliciousClient();
        }
        else {
            this.clientInstance = new FrsClientCore(connectionConfig);
        }
    }

    public async createContainer(
        serviceConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FrsResources> {
        if (this.connectionConfig.type === "localMode") {
            const tinyliciousResources = await (this.clientInstance as TinyliciousClient).createContainer({
                id: serviceConfig.id,
                logger: serviceConfig.logger,
            }, containerSchema);
            return this.convertTinyliciousToFrsResources(tinyliciousResources);
        } else {
            return (this.clientInstance as FrsClientCore).createContainer(serviceConfig, containerSchema);
        }
    }

    public async getContainer(
        serviceConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FrsResources> {
        if (this.connectionConfig.type === "localMode") {
            const tinyliciousResources = await (this.clientInstance as TinyliciousClient).getContainer({
                id: serviceConfig.id,
                logger: serviceConfig.logger,
            }, containerSchema);
            return this.convertTinyliciousToFrsResources(tinyliciousResources);
        } else {
            return (this.clientInstance as FrsClientCore).getContainer(serviceConfig, containerSchema);
        }
    }

    private convertTinyliciousToFrsResources(tinyliciousResources: TinyliciousResources): FrsResources {
        return {
            fluidContainer: tinyliciousResources.fluidContainer,
            containerServices: {
                /**
                 * NOTE: If audience member types here begin to diverge for Tinylicious and FRS,
                 * TSLint will throw an error and we can add in specific converters between the different member fields
                 */
                audience: tinyliciousResources.containerServices.audience,
            },
        };
    }
}
