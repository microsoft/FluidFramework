/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Loader } from "@fluidframework/container-loader";
import { DOProviderContainerRuntimeFactory, FluidContainer, } from "@fluid-experimental/fluid-framework";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { FrsAudience } from "./FrsAudience";
import { FrsUrlResolver } from "./FrsUrlResolver";
/**
 * FrsClient provides the ability to have a Fluid object backed by the FRS service or, when running with
 * local tenantId, have it be backed by a Tinylicious local service instance
 */
export class FrsClient {
    constructor(connectionConfig) {
        this.connectionConfig = connectionConfig;
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(this.connectionConfig.tokenProvider);
    }
    async createContainer(containerConfig, containerSchema) {
        const loader = this.createLoader(containerConfig, containerSchema);
        const container = await loader.createDetachedContainer({
            package: "no-dynamic-package",
            config: {},
        });
        await container.attach({ url: containerConfig.id });
        return this.getFluidContainerAndServices(container);
    }
    async getContainer(containerConfig, containerSchema) {
        const loader = this.createLoader(containerConfig, containerSchema);
        const container = await loader.resolve({ url: containerConfig.id });
        return this.getFluidContainerAndServices(container);
    }
    async getFluidContainerAndServices(container) {
        const rootDataObject = await requestFluidObject(container, "/");
        const fluidContainer = new FluidContainer(container, rootDataObject);
        const containerServices = this.getContainerServices(container);
        const frsResources = { fluidContainer, containerServices };
        return frsResources;
    }
    getContainerServices(container) {
        return {
            audience: new FrsAudience(container),
        };
    }
    createLoader(containerConfig, containerSchema) {
        const runtimeFactory = new DOProviderContainerRuntimeFactory(containerSchema);
        const module = { fluidExport: runtimeFactory };
        const codeLoader = { load: async () => module };
        const urlResolver = new FrsUrlResolver(this.connectionConfig.tenantId, this.connectionConfig.orderer, this.connectionConfig.storage, containerConfig.id, this.connectionConfig.tokenProvider);
        return new Loader({
            urlResolver,
            documentServiceFactory: this.documentServiceFactory,
            codeLoader,
            logger: containerConfig.logger,
        });
    }
}
//# sourceMappingURL=FrsClient.js.map