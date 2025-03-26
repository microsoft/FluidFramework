/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IClientConfiguration,
	INackContent,
	NackErrorType,
} from "@fluidframework/protocol-definitions";

// Deli lambda configuration
/**
 * @internal
 */
export interface IDeliServerConfiguration {
	// Enables nack messages logic
	enableNackMessages: boolean;

	// Enables hashing of sequenced ops
	enableOpHashing: boolean;

	// Enables automatically updating the DNS when sequencing a summaryAck
	enableAutoDSNUpdate: boolean;

	// Enables creating join/leave signals for write clients
	enableWriteClientSignals: boolean;

	// Enables ephemeral container summary deletion on deli close
	enableEphemeralContainerSummaryCleanup: boolean;

	// Time to wait before deleting ephemeral container summaries
	ephemeralContainerSoftDeleteTimeInMs: number;

	// Enables deli to maintain batches as it produces them to the next lambdas
	maintainBatches: boolean;

	// Enables deli to check for idle clients when it starts
	checkForIdleClientsOnStartup: boolean;

	// Expire clients after this amount of inactivity
	clientTimeout: number;

	// Timeout for sending no-ops to trigger inactivity checker
	activityTimeout: number;

	// How often to check for idle read clients
	readClientIdleTimer: number;

	// Timeout for sending consolidated no-ops
	noOpConsolidationTimeout: number;

	// Controller how often deli should checkpoint
	checkpointHeuristics: ICheckpointHeuristicsServerConfiguration;

	// Controls how deli should track of certain op events
	opEvent: IDeliOpEventServerConfiguration;

	// Controls if ops should be nacked if a summary hasn't been made for a while
	summaryNackMessages: IDeliSummaryNackMessagesServerConfiguration;

	// Enable to make deli not add additionalContent to summarize messages that are for the single commit flow
	skipSummarizeAugmentationForSingleCommmit: boolean;

	// disable sequencing NoClient messages
	disableNoClientMessage: boolean;

	// enables marking leave ops with a flag when they were the last client
	enableLeaveOpNoClientServerMetadata: boolean;

	// enables restarting the process when deli fails to checkpoint
	restartOnCheckpointFailure: boolean;

	// enables kafka checkpoints when reprocessing messages
	kafkaCheckpointOnReprocessingOp: boolean;
}

/**
 * @internal
 */
export interface ICheckpointHeuristicsServerConfiguration {
	// Enables checkpointing based on the heuristics
	enable: boolean;

	// Checkpoint after not processing any messages after this amount of time
	idleTime: number;

	// Checkpoint if there hasn't been a checkpoint for this amount of time
	maxTime: number;

	// Checkpoint after processing this amount of messages since the last checkpoint
	maxMessages: number;
}

/**
 * @internal
 */
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

/**
 * @internal
 */
export interface IBroadcasterServerConfiguration {
	// Enables including the event name in the topic name for message batching
	includeEventInMessageBatchName: boolean;
}

// Scribe lambda configuration
/**
 * @internal
 */
export interface IScribeServerConfiguration {
	// Enables generating service summaries
	generateServiceSummary: boolean;

	// Enables including pending messages in checkpoints
	enablePendingCheckpointMessages: boolean;

	// Enables clearing the checkpoint cache after a service summary is created
	clearCacheAfterServiceSummary: boolean;

	// Enables writing a summary nack when an exception occurs during summary creation
	ignoreStorageException: boolean;

	// Controls how often scribe should checkpoint
	checkpointHeuristics: ICheckpointHeuristicsServerConfiguration;

	// Enables scrubbing user data from protocol state quorum in Summaries
	scrubUserDataInSummaries: boolean;

	// Enables scrubbing user data from protocol state quorum in local checkpoints
	scrubUserDataInLocalCheckpoints: boolean;

	// Enables scrubbing user data from protocol state quorum in global checkpoints
	scrubUserDataInGlobalCheckpoints: boolean;

	// Limits the number of service summary versions to track as "valid parent summaries"
	// since the last client summary. If the list grows beyond this limit, the oldest
	// service summary version is removed.
	maxTrackedServiceSummaryVersionsSinceLastClientSummary: number;
}

/**
 * @internal
 */
export interface IDeliSummaryNackMessagesServerConfiguration {
	// Enables nacking non-system & non-summarizer client message if
	// the op count since the last summary exceeds this limit
	enable: boolean;

	// Check the summary nack messages state when starting up
	// It will potentionally reset the nackMessages flag
	checkOnStartup: boolean;

	// Amount of ops since the last summary before starting to nack
	maxOps: number;

	// The contents of the nack to send after the limit is hit
	nackContent: INackContent;
}

// Document lambda configuration
/**
 * @internal
 */
export interface IDocumentLambdaServerConfiguration {
	// Expire document partitions after this long of no activity
	partitionActivityTimeout: number;

	// How often to check the partitions for inacitivty
	partitionActivityCheckInterval: number;
}

// Moira lambda configuration
/**
 * @internal
 */
export interface IMoiraServerConfiguration {
	// Enables Moira submission lambda
	enable: boolean;
	endpoint: string;
}

/**
 * Key value store of service configuration properties
 * @internal
 */
export interface IServiceConfiguration extends IClientConfiguration, IServerConfiguration {
	[key: string]: any;
}

/**
 * Key value store of service configuration properties for the server
 * @internal
 */
export interface IServerConfiguration {
	// Deli lambda configuration
	deli: IDeliServerConfiguration;

	// Broadcaster lambda configuration
	broadcaster: IBroadcasterServerConfiguration;

	// Scribe lambda configuration
	scribe: IScribeServerConfiguration;

	// Moira lambda configuration
	moira: IMoiraServerConfiguration;

	// Document lambda configuration
	documentLambda: IDocumentLambdaServerConfiguration;

	// Enable adding a traces array to operation messages
	enableTraces: boolean;

	// Enable telemetry using the Lumberjack framework
	enableLumberjack: boolean;
}

/**
 * @internal
 */
export const DefaultServiceConfiguration: IServiceConfiguration = {
	blockSize: 64436,
	maxMessageSize: 16 * 1024,
	enableTraces: true,
	enableLumberjack: true,
	deli: {
		enableNackMessages: true,
		enableOpHashing: true,
		enableAutoDSNUpdate: false,
		enableEphemeralContainerSummaryCleanup: true,
		ephemeralContainerSoftDeleteTimeInMs: -1,
		checkForIdleClientsOnStartup: false,
		maintainBatches: false,
		enableWriteClientSignals: false,
		clientTimeout: 5 * 60 * 1000,
		activityTimeout: 30 * 1000,
		readClientIdleTimer: 60 * 1000,
		noOpConsolidationTimeout: 250,
		checkpointHeuristics: {
			enable: false,
			idleTime: 10 * 1000,
			maxTime: 1 * 60 * 1000,
			maxMessages: 500,
		},
		opEvent: {
			enable: false,
			idleTime: 15 * 1000,
			maxTime: 5 * 60 * 1000,
			maxOps: 1500,
		},
		summaryNackMessages: {
			enable: false,
			checkOnStartup: false,
			maxOps: 5000,
			nackContent: {
				code: 429,
				type: NackErrorType.ThrottlingError,
				retryAfter: 10,
				message: "Submit a summary before inserting additional operations",
			},
		},
		skipSummarizeAugmentationForSingleCommmit: false,
		disableNoClientMessage: false,
		enableLeaveOpNoClientServerMetadata: false,
		restartOnCheckpointFailure: true,
		kafkaCheckpointOnReprocessingOp: true,
	},
	broadcaster: {
		includeEventInMessageBatchName: false,
	},
	scribe: {
		generateServiceSummary: true,
		enablePendingCheckpointMessages: true,
		clearCacheAfterServiceSummary: false,
		ignoreStorageException: false,
		checkpointHeuristics: {
			enable: false,
			idleTime: 10 * 1000,
			maxTime: 1 * 60 * 1000,
			maxMessages: 500,
		},
		scrubUserDataInSummaries: false,
		scrubUserDataInLocalCheckpoints: false,
		scrubUserDataInGlobalCheckpoints: false,
		maxTrackedServiceSummaryVersionsSinceLastClientSummary: 10,
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

// Kafka has an internal limit of 1Mb.
// Runtime has a client-imposed limit of 700kb.
// Set our enforced limit at 900kb to give space for any
// mysterious overhead.
/**
 * @internal
 */
export const MaxKafkaMessageSize = 900 * 1024;
