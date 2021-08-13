/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerSchema } from "@fluid-experimental/fluid-framework";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { FrsConnectionConfig, FrsContainerConfig, FrsResources } from "./interfaces";
/**
 * FrsClient provides the ability to have a Fluid object backed by the FRS service or, when running with
 * local tenantId, have it be backed by a Tinylicious local service instance
 */
export declare class FrsClient {
    private readonly connectionConfig;
    readonly documentServiceFactory: IDocumentServiceFactory;
    constructor(connectionConfig: FrsConnectionConfig);
    createContainer(containerConfig: FrsContainerConfig, containerSchema: ContainerSchema): Promise<FrsResources>;
    getContainer(containerConfig: FrsContainerConfig, containerSchema: ContainerSchema): Promise<FrsResources>;
    private getFluidContainerAndServices;
    private getContainerServices;
    private createLoader;
}
//# sourceMappingURL=FrsClient.d.ts.map