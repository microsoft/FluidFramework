/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClientConfiguration } from "@fluidframework/protocol-definitions";

// Deli lambda configuration
export interface IDeliServerConfiguration {
    // Expire clients after this amount of inactivity
    clientTimeout: number;

    // Timeout for sending no-ops to trigger inactivity checker
    activityTimeout: number;

    // Timeout for sending consolidated no-ops
    noOpConsolidationTimeout: number;
}

// Scribe lambda configuration
export interface IScribeServerConfiguration {
    // Enables generating service summaries
    generateServiceSummary: boolean;

    // Enables clearing the checkpoint cache after a service summary is created
    clearCacheAfterServiceSummary: boolean;

    // Enables writing a summary nack when an exception occurs during summary creation
    ignoreStorageException: boolean;
}

/**
 * Key value store of service configuration properties
 */
export interface IServiceConfiguration extends IClientConfiguration, IServerConfiguration {
    [key: string]: any;
}

/**
 * Key value store of service configuration properties for the server
 */
export interface IServerConfiguration {
    // Deli lambda configuration
    deli: IDeliServerConfiguration;

    // Scribe lambda configuration
    scribe: IScribeServerConfiguration;

    // Enable adding a traces array to operation messages
    enableTraces: boolean;
}

export const DefaultServiceConfiguration: IServiceConfiguration = {
    blockSize: 64436,
    maxMessageSize: 16 * 1024,
    enableTraces: true,
    summary: {
        idleTime: 5000,
        maxOps: 1000,
        maxTime: 5000 * 12,
        maxAckWaitTime: 600000,
    },
    deli: {
        clientTimeout: 5 * 60 * 1000,
        activityTimeout: 30 * 1000,
        noOpConsolidationTimeout: 250,
    },
    scribe: {
        generateServiceSummary: true,
        clearCacheAfterServiceSummary: false,
        ignoreStorageException: false,
    },
};
