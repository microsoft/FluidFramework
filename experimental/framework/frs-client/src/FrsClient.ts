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
    FrsContainerConfig,
    FrsContainerServices,
} from "./interfaces";
import { FrsAudience } from "./FrsAudience";
import { FrsSimpleUrlResolver } from "./FrsSimpleUrlResolver";

/**
 * FrsClientInstance provides the ability to have a Fluid object backed by the FRS service
 */
export class FrsClientInstance {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly user;
    constructor(private readonly connectionConfig: FrsConnectionConfig) {
        this.user = this.connectionConfig.user
            ? { id: this.connectionConfig.user.userId, name: this.connectionConfig.user.userName }
            : generateUser();
        const tokenProvider: ITokenProvider = connectionConfig.tokenProvider
            ?? new InsecureTokenProvider(connectionConfig.key, this.user);
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    public async createContainer(
        containerConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<[FluidContainer, FrsContainerServices]> {
        return this.getContainerCore(
            containerConfig,
            containerSchema,
            true,
        );
    }

    public async getContainer(
        containerConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<[FluidContainer, FrsContainerServices]> {
        return this.getContainerCore(
            containerConfig,
            containerSchema,
            false,
        );
    }

    private async getFluidContainerAndServices(
        container: Container,
    ): Promise<[FluidContainer, FrsContainerServices]> {
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer = new FluidContainer(container, rootDataObject);
        const containerServices = this.getContainerServices(container);
        return [fluidContainer, containerServices];
    }

    private getContainerServices(
        container: Container,
    ): FrsContainerServices {
        return {
            audience: new FrsAudience(container),
        };
    }

    private async getContainerCore(
        containerConfig: FrsContainerConfig,
        containerSchema: ContainerSchema,
        createNew: boolean,
    ): Promise<[FluidContainer, FrsContainerServices]> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const module = { fluidExport: runtimeFactory };
        const codeLoader = { load: async () => module };
        const urlResolver = new FrsSimpleUrlResolver(this.connectionConfig, containerConfig.id);
        const loader = new Loader({
            urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: containerConfig.logger,
        });

        let container: Container;

        if (createNew) {
            // We're not actually using the code proposal (our code loader always loads the same module
            // regardless of the proposal), but the Container will only give us a NullRuntime if there's
            // no proposal.  So we'll use a fake proposal.
            container = await loader.createDetachedContainer({
                package: "no-dynamic-package",
                config: {},
            });
            await container.attach({ url: containerConfig.id });
        } else {
            // Request must be appropriate and parseable by resolver.
            container = await loader.resolve({ url: containerConfig.id });
            // If we didn't create the container properly, then it won't function correctly.
            // So we'll throw if we got a
            // new container here, where we expect this to be loading an existing container.
            if (container.existing === undefined) {
                throw new Error("Attempted to load a non-existing container");
            }
        }
        return this.getFluidContainerAndServices(container);
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
            console.log(
                `FrsClient has already been initialized. Using existing instance of
                FrsClient instead.`,
            );
        }
        FrsClient.globalInstance = new FrsClientInstance(
            connectionConfig,
        );
    }

    static async createContainer(
        serviceConfig: FrsContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<[FluidContainer, FrsContainerServices]> {
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
    ): Promise<[FluidContainer, FrsContainerServices]> {
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
