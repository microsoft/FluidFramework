/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRuntimeFactory } from "@fluidframework/container-definitions";
export interface IRouterliciousConfig {
    orderer: string;
    storage: string;
    tenantId: string;
    key: string;
}
/**
 * Connect to an implementation of the Routerlicious service and retrieve a Container with
 * the given ID running the given code.
 *
 * @param containerId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 * @param createNew - Is this a new container
 * @param config
 */
export declare function getRouterliciousContainer(containerId: string, containerRuntimeFactory: IRuntimeFactory, createNew: boolean, config: IRouterliciousConfig): Promise<import("@fluidframework/container-loader").Container>;
//# sourceMappingURL=getRouterliciousContainer.d.ts.map