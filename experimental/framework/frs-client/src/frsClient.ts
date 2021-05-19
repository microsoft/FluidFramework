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

import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { RouterliciousService } from "@fluid-experimental/get-container";

import {
    FRSContainerConfig,
} from "./interfaces";

/**
 * FRSClientInstance provides the ability to have a Fluid object backed by a FRS service
 */
export class FRSClientInstance {
    constructor(private readonly serviceConnectionConfig: RouterliciousService) {
    }

    public async createContainer(
        serviceContainerConfig: FRSContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const container = await this.getContainerCore(
            serviceContainerConfig,
            runtimeFactory,
            true,
        );

        const rootDataObject = await this.getRootDataObject(container);
        return new FluidContainer(container, rootDataObject);
    }

    public async getContainer(
        serviceContainerConfig: FRSContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const container = await this.getContainerCore(
            serviceContainerConfig,
            runtimeFactory,
            false,
        );

        const rootDataObject = await this.getRootDataObject(container);
        return new FluidContainer(container, rootDataObject);
    }

    private async getRootDataObject(
        container: Container,
    ): Promise<RootDataObject> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as RootDataObject;
    }

    private async getContainerCore(
        routerliciousContainerConfig: FRSContainerConfig,
        containerRuntimeFactory: IRuntimeFactory,
        createNew: boolean,
    ): Promise<Container> {
        const module = { fluidExport: containerRuntimeFactory };
        const codeLoader = { load: async () => module };

        const loader = new Loader({
            urlResolver: this.serviceConnectionConfig.urlResolver,
            documentServiceFactory: this.serviceConnectionConfig.documentServiceFactory,
            codeLoader,
            logger: routerliciousContainerConfig.logger,
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
            await container.attach({ url: routerliciousContainerConfig.id });
        } else {
            // Request must be appropriate and parseable by resolver.
            container = await loader.resolve({ url: routerliciousContainerConfig.id });
            // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
            // new container here, where we expect this to be loading an existing container.
            if (container.existing === undefined) {
                throw new Error("Attempted to load a non-existing container");
            }
        }
        return container;
    }
}

/**
 * FRSClient static class with singular global instance that lets the developer define
 * all Container interactions with the FRS service
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class FRSClient {
    private static globalInstance: FRSClientInstance | undefined;

    static init(serviceConnectionConfig: RouterliciousService) {
        if (FRSClient.globalInstance) {
            console.log(
                `FRSClient has already been initialized. Using existing instance of
                FRSClient instead.`,
            );
        }
        FRSClient.globalInstance = new FRSClientInstance(
            serviceConnectionConfig,
        );
    }

    static async createContainer(
        serviceConfig: FRSContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer> {
        if (!FRSClient.globalInstance) {
            throw new Error(
                "FRSClient has not been properly initialized before attempting to create a container",
            );
        }
        return FRSClient.globalInstance.createContainer(
            serviceConfig,
            objectConfig,
        );
    }

    static async getContainer(
        serviceConfig: FRSContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer> {
        if (!FRSClient.globalInstance) {
            throw new Error(
                "FRSClient has not been properly initialized before attempting to get a container",
            );
        }
        return FRSClient.globalInstance.getContainer(
            serviceConfig,
            objectConfig,
        );
    }
}
