/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    ContainerSchema,
    DOProviderContainerRuntimeFactory,
    FluidContainer,
    RootDataObject,
} from "fluid-framework";
import {
    TinyliciousConnectionConfig,
    TinyliciousContainerConfig,
    TinyliciousContainerServices,
    TinyliciousResources,
} from "./interfaces";
import { TinyliciousAudience } from "./TinyliciousAudience";

/**
 * TinyliciousClient provides the ability to have a Fluid object backed by a Tinylicious service
 */
export class TinyliciousClient {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver;

    constructor(serviceConnectionConfig?: TinyliciousConnectionConfig) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(
            serviceConnectionConfig?.port,
            serviceConnectionConfig?.domain,
        );
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    public async createContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<TinyliciousResources> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const container = await this.getContainerCore(
            serviceContainerConfig,
            runtimeFactory,
            true,
        );
        return this.getFluidContainerAndServices(container);
    }

    public async getContainer(
        serviceContainerConfig: TinyliciousContainerConfig,
        containerSchema: ContainerSchema,
    ): Promise<TinyliciousResources> {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(
            containerSchema,
        );
        const container = await this.getContainerCore(
            serviceContainerConfig,
            runtimeFactory,
            false,
        );
        return this.getFluidContainerAndServices(container);
    }

    private async getFluidContainerAndServices(
        container: Container,
    ): Promise<TinyliciousResources>  {
        const rootDataObject = await requestFluidObject<RootDataObject>(container, "/");
        const fluidContainer: FluidContainer = new FluidContainer(container, rootDataObject);
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
        tinyliciousContainerConfig: TinyliciousContainerConfig,
        containerRuntimeFactory: IRuntimeFactory,
        createNew: boolean,
    ): Promise<Container> {
        const module = { fluidExport: containerRuntimeFactory };
        const codeLoader = { load: async () => module };

        const loader = new Loader({
            urlResolver: this.urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: tinyliciousContainerConfig.logger,
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
            await container.attach({ url: tinyliciousContainerConfig.id });
        } else {
            // Request must be appropriate and parseable by resolver.
            container = await loader.resolve({ url: tinyliciousContainerConfig.id });
        }
        return container;
    }
}
