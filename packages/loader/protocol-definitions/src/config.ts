/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Summary algorithm configuration
// A summary will occur either if
// * idleTime(ms) have passed without activity with pending ops to summarize
// * maxTime(ms) have passed without activity with pending ops to summarize
// * maxOps are waiting to summarize
export interface ISummaryConfiguration {
    idleTime: number;

    maxTime: number;

    maxOps: number;
}

/**
 * key value store of service configuration properties provided as part of connection
 */
export interface IServiceConfiguration {
    [key: string]: any;

    // Max message size the server will accept before requiring chunking
    maxMessageSize: number;

    // Server defined ideal block size for storing snapshots
    blockSize: number;

    summary: ISummaryConfiguration;
}
