/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGitManager } from "@microsoft/fluid-server-services-client";

export interface ITenantConfig {
    id: string;

    storage: ITenantStorage;

    orderer: ITenantOrderer;
}

export interface ITenantStorage {
    // External URL to Historian outside of the cluster
    historianUrl: string;

    // Internal URL to Historian within the cluster
    internalHistorianUrl: string;

    // URL to the storage provider
    url: string;

    // Storage provider owner
    owner: string;

    // Storage provider repository
    repository: string;

    // Access credentials to the storage provider
    credentials: {
        // User accessing the storage provider
        user: string;

        // Password for the storage provider
        password: string;
    };
}

export interface ITenantOrderer {
    // URL to the ordering service
    url: string;

    // The type of ordering service
    type: string;
}

export interface ITenant {
    gitManager: IGitManager;

    storage: ITenantStorage;

    orderer: ITenantOrderer;
}

export interface ITenantManager {
    /**
     * Retrieves details for the given tenant
     */
    getTenant(tenantId: string): Promise<ITenant>;

    /**
     * Verifies that the given auth token is valid. A rejected promise indicaets an invalid token.
     */
    verifyToken(tenantId: string, token: string): Promise<void>;

    /**
     * Retrieves the key for the given tenant. This is a privileged op and should be used with care.
     */
    getKey(tenantId: string): Promise<string>;
}
