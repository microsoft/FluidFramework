/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenProvider } from "@fluidframework/routerlicious-driver";
import {
    FluidContainer,
    IMember,
    IServiceAudience,
} from "fluid-framework";

export interface AzureConnectionConfig {
    tenantId: "local" | string;
    orderer: string;
    storage: string;
    tokenProvider: ITokenProvider;
}

/**
 * AzureContainerServices is returned by the AzureClient alongside a FluidContainer.
 * It holds the functionality specifically tied to the Azure Fluid Relay service (FRS), and how the data stored in
 * the FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to use,
 * will not be included here but rather on the FluidContainer class itself.
 */
export interface AzureContainerServices {
    /**
     * Provides an object that can be used to get the users that are present in this Fluid session and
     * listeners for when the roster has any changes from users joining/leaving the session
     */
    audience: IAzureAudience;
}

/**
 * Since Azure provides user names for all of its members, we extend the IMember interface to include
 * this service-specific value. It will be returned for all audience members connected to Azure.
 */
export interface AzureMember<T = any> extends IMember {
    userName: string;
    additionalDetails?: T;
}

export interface AzureResources {
    fluidContainer: FluidContainer;
    containerServices: AzureContainerServices;
}

export type IAzureAudience = IServiceAudience<AzureMember>;
