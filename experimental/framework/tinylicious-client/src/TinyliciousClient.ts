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
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
    InsecureTinyliciousTokenProvider,
    InsecureTinyliciousUrlResolver,
} from "@fluidframework/tinylicious-driver";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    TinyliciousConnectionConfig,
    TinyliciousContainerConfig,
} from "./interfaces";

/**
 * TinyliciousClientInstance provides the ability to have a Fluid object backed by a Tinylicious service
 */
export class TinyliciousClientInstance {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver;

    constructor(serviceConnectionConfig?: TinyliciousConnectionConfig) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(
            serviceConnectionConfig?.port,
        );
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    public async createContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const container = await this.getContainerCore(
            serviceContainerConfig.id,
            runtimeFactory,
            true,
        );

        const rootDataObject = await this.getRootDataObject(container);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return new FluidContainer(container, rootDataObject);
    }

    public async getContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<FluidContainer> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const container = await this.getContainerCore(
            serviceContainerConfig.id,
            runtimeFactory,
            false,
        );

        const rootDataObject = await this.getRootDataObject(container);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return new FluidContainer(container, rootDataObject);
    }

    private async getRootDataObject(
        container: Container,
    ): Promise<RootDataObject> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as RootDataObject;
    }

    private async getContainerCore(
        containerId: string,
        containerRuntimeFactory: IRuntimeFactory,
        createNew: boolean,
    ): Promise<Container> {
        const module = { fluidExport: containerRuntimeFactory };
        const codeLoader = { load: async () => module };

        const loader = new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
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
            await container.attach({ url: containerId });
        } else {
            // Request must be appropriate and parseable by resolver.
            container = await loader.resolve({ url: containerId });
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
 * TinyliciousClient static class with singular global instance that lets the developer define
 * all Container interactions with the Tinylicious service
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class TinyliciousClient {
    private static globalInstance: TinyliciousClientInstance | undefined;

    static init(serviceConnectionConfig?: TinyliciousConnectionConfig) {
        if (TinyliciousClient.globalInstance) {
            console.log(
                `TinyliciousClient has already been initialized. Using existing instance of
                TinyliciousClient instead.`,
            );
        }
        TinyliciousClient.globalInstance = new TinyliciousClientInstance(
            serviceConnectionConfig,
        );
    }

    static async createContainer(
        serviceConfig: TinyliciousContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer> {
        if (!TinyliciousClient.globalInstance) {
            throw new Error(
                "TinyliciousClient has not been properly initialized before attempting to create a container",
            );
        }
        return TinyliciousClient.globalInstance.createContainer(
            serviceConfig,
            objectConfig,
        );
    }

    static async getContainer(
        serviceConfig: TinyliciousContainerConfig,
        objectConfig: ContainerSchema,
    ): Promise<FluidContainer> {
        if (!TinyliciousClient.globalInstance) {
            throw new Error(
                "TinyliciousClient has not been properly initialized before attempting to get a container",
            );
        }
        return TinyliciousClient.globalInstance.getContainer(
            serviceConfig,
            objectConfig,
        );
    }
}
