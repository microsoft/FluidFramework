/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Summary algorithm configuration
// A summary will occur either if
// * idleTime(ms) have passed without activity with pending ops to summarize
// * maxTime(ms) have passed with pending ops to summarize
// * maxOps are waiting to summarize
export interface ISummaryConfiguration {
    idleTime: number;

    maxTime: number;

    maxOps: number;

    maxAckWaitTime: number;
}

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
 * Key value store of service configuration properties provided to the client as part of connection
 */
export interface IClientConfiguration {
    // Max message size the server will accept before requiring chunking
    maxMessageSize: number;

    // Server defined ideal block size for storing snapshots
    blockSize: number;

    // Summary algorithm configuration. This is sent to clients when they connect
    summary: ISummaryConfiguration;
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
