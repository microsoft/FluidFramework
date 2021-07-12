/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClientConfiguration, INackContent, NackErrorType } from "@fluidframework/protocol-definitions";

// Deli lambda configuration
export interface IDeliServerConfiguration {
    // Enables nack messages logic
    enableNackMessages: boolean;

    // Expire clients after this amount of inactivity
    clientTimeout: number;

    // Timeout for sending no-ops to trigger inactivity checker
    activityTimeout: number;

    // Timeout for sending consolidated no-ops
    noOpConsolidationTimeout: number;

    // Controls how deli should track of certain op events
    opEvent: IDeliOpEventServerConfiguration;
}

export interface IDeliOpEventServerConfiguration {
    // Enables emitting events based on the heuristics
    enable: boolean;

    // Causes an event to fire after deli doesn't process any ops after this amount of time
    idleTime: number | undefined;

    // Causes an event to fire based on the time since the last emit
    maxTime: number | undefined;

    // Causes an event to fire based on the number of ops since the last emit
    maxOps: number | undefined;
}

// Scribe lambda configuration
export interface IScribeServerConfiguration {
    // Enables generating service summaries
    generateServiceSummary: boolean;

    // Enables including pending messages in checkpoints
    enablePendingCheckpointMessages: boolean;

    // Enables clearing the checkpoint cache after a service summary is created
    clearCacheAfterServiceSummary: boolean;

    // Enables writing a summary nack when an exception occurs during summary creation
    ignoreStorageException: boolean;

    // Controls if ops should be nacked if a summarizer hasn't been made for a while
    nackMessages: IScribeNackMessagesServerConfiguration;
}

export interface IScribeNackMessagesServerConfiguration {
    // Enables nacking non-system & non-summarizer client message if
    // the op count since the last summary exceeds this limit
    enable: boolean;

    // Amount of ops since the last summary before starting to nack
    maxOps: number;

    // The contents of the nack to send after the limit is hit
    nackContent: INackContent;
}

// Document lambda configuration
export interface IDocumentLambdaServerConfiguration {
    // Expire document partitions after this long of no activity
    partitionActivityTimeout: number;

    // How often to check the partitions for inacitivty
    partitionActivityCheckInterval: number;
}

// Moira lambda configuration
export interface IMoiraServerConfiguration {
    // Enables Moira submission lambda
    enable: boolean;
    endpoint: string;
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

    // Moira lambda configuration
    moira: IMoiraServerConfiguration;

    // Document lambda configuration
    documentLambda: IDocumentLambdaServerConfiguration;

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
        enableNackMessages: true,
        clientTimeout: 5 * 60 * 1000,
        activityTimeout: 30 * 1000,
        noOpConsolidationTimeout: 250,
        opEvent: {
            enable: false,
            idleTime: 15 * 1000,
            maxTime: 5 * 60 * 1000,
            maxOps: 1500,
        },
    },
    scribe: {
        generateServiceSummary: true,
        enablePendingCheckpointMessages: true,
        clearCacheAfterServiceSummary: false,
        ignoreStorageException: false,
        nackMessages: {
            enable: false,
            maxOps: 5000,
            nackContent: {
                code: 429,
                type: NackErrorType.ThrottlingError,
                retryAfter: 10,
                message: "Submit a summary before inserting additional operations",
            },
        },
    },
    moira: {
        enable: false,
        endpoint: "",
    },
    documentLambda: {
        partitionActivityTimeout: 10 * 60 * 1000,
        partitionActivityCheckInterval: 60 * 1000,
    },
};
