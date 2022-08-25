/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGitManager } from "@fluidframework/server-services-client";

export interface ITenantConfig {
    id: string;

    storage: ITenantStorage;

    orderer: ITenantOrderer;

    customData: ITenantCustomData;

    // Timestamp of when this tenant will be hard deleted.
    // The tenant is soft deleted if a deletion timestamp is present.
    scheduledDeletionTime?: string;
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

export interface ITenantCustomData {
    [key: string]: any;
}

export interface ITenantKeys {
    key1: string;
    key2: string;
}

export enum KeyName {
    key1 = "key1",
    key2 = "key2",
}

export interface ITenant {
    gitManager: IGitManager;

    storage: ITenantStorage;

    orderer: ITenantOrderer;
}

export interface ITenantManager {
    /**
     * Creates a new tenant with the given id, or a randomly generated id when none is provided.
     */
    createTenant(tenantId?: string): Promise<ITenantConfig & { key: string; }>;

    /**
     * Retrieves details for the given tenant
     */
    getTenant(tenantId: string, documentId: string): Promise<ITenant>;

    /**
     * Verifies that the given auth token is valid. A rejected promise indicates an invalid token.
     */
    verifyToken(tenantId: string, token: string): Promise<void>;

    /**
     * Retrieves the key for the given tenant. This is a privileged op and should be used with care.
     */
    getKey(tenantId: string): Promise<string>;
}
