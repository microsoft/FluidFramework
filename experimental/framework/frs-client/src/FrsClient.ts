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
} from "@fluidframework/driver-definitions";
import { ITokenProvider, RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { generateUser } from "@fluidframework/server-services-client";
import {
    FrsConnectionConfig,
    FrsContainerAndServices,
    FrsContainerConfig,
    FrsContainerServices,
} from "./interfaces";
import { FrsAudience } from "./FrsAudience";
import { FrsUrlResolver } from "./FrsUrlResolver";
import { debug } from "./debug";

/**
 * FrsClientInstance provides the ability to have a Fluid object backed by the FRS service
 */
export class FrsClientInstance {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly tokenProvider: ITokenProvider;
    constructor(private readonly connectionConfig: FrsConnectionConfig) {
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
    ): Promise<FrsContainerAndServices> {
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
    ): Promise<FrsContainerAndServices> {
        const loader = this.createLoader(containerConfig, containerSchema);
        const container = await loader.resolve({ url: containerConfig.id });
        if (container.existing !== true) {
            throw new Error("Attempted to load a non-existing container");
        }
        return this.getFluidContainerAndServices(container);
    }

    // private async getFluidContainerAndServices(
    //     container: Container,
    // ): Promise<[FluidContainer, FrsContainerServices]> {
    //     const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
    //     const fluidContainer = new FluidContainer(container, rootDataObject);
    //     const containerServices = this.getContainerServices(container);
    //     return [fluidContainer, containerServices];
    // }

    private async getFluidContainerAndServices(
        container: Container,
    ): Promise<FrsContainerAndServices> {
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer: FluidContainer = new FluidContainer(container, rootDataObject);
        const containerServices: FrsContainerServices = this.getContainerServices(container);
        const frsContainerAndServices: FrsContainerAndServices = { fluidContainer, containerServices };
        return frsContainerAndServices;
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
 * FrsClient static class with singular global instance that lets the developer define
 * all Container interactions with the Frs service
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class FrsClient {
    private static globalInstance: FrsClientInstance | undefined;

    static init(connectionConfig: FrsConnectionConfig) {
        if (FrsClient.globalInstance) {
            debug(
                `FrsClient has already been initialized. Using existing instance of
                FrsClient instead.`,
            );
            return;
        }
        FrsClient.globalInstance = new FrsClientInstance(
            connectionConfig,
        );
    }

    static async createContainer(
        serviceConfig: FrsContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FrsContainerAndServices> {
        if (!FrsClient.globalInstance) {
            throw new Error(
                "FrsClient has not been properly initialized before attempting to create a container",
            );
        }
        return FrsClient.globalInstance.createContainer(
            serviceConfig,
            objectConfig,
        );
    }

    static async getContainer(
        serviceConfig: FrsContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FrsContainerAndServices> {
        if (!FrsClient.globalInstance) {
            throw new Error(
                "FrsClient has not been properly initialized before attempting to get a container",
            );
        }
        return FrsClient.globalInstance.getContainer(
            serviceConfig,
            objectConfig,
        );
    }
}
