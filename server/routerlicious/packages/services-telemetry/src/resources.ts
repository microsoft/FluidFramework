/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { serializeError } from "serialize-error";
import { Lumber } from "./lumber";
import { LumberEventName } from "./lumberEventNames";

// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
const isNode =
	// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
	typeof process !== "undefined" && process.versions != null && process.versions.node != null;

/**
 * @internal
 */
export enum LogLevel {
	Error,
	Warning,
	Info,
	Verbose,
	Debug,
}

/**
 * @internal
 */
export enum LumberType {
	Metric,
	Log,
}

/**
 * @internal
 */
export enum BaseTelemetryProperties {
	tenantId = "tenantId",
	documentId = "documentId",
	correlationId = "correlationId",
	requestSource = "requestSource",
}

// Incoming message properties
/**
 * @internal
 */
export enum QueuedMessageProperties {
	topic = "topic",
	partition = "partition",
	offset = "offset",

	// use offsetStart and offsetEnd to log the range of kafka offsets being processed
	offsetStart = "offsetStart",
	offsetEnd = "offsetEnd",
}

/**
 * @internal
 */
export enum HttpProperties {
	driverVersion = "driverVersion",
	method = "method",
	pathCategory = "pathCategory",
	requestContentLength = "requestContentLength",
	responseContentLength = "responseContentLength",
	responseTime = "responseTime",
	responsePrefinishToFinishLatencyMs = "responsePrefinishToFinishLatencyMs",
	responseFinishToCloseLatencyMs = "responseFinishToCloseLatencyMs",
	status = "status",
	url = "url",
	retryCount = "retryCount",
	scheme = "scheme",
	httpVersion = "httpVersion",
}

/**
 * @internal
 */
export enum CommonProperties {
	// Client properties
	clientId = "clientId",
	clientType = "clientType",
	clientCount = "clientCount",
	clientDriverVersion = "clientDriverVersion",

	// Connection properties
	connectionClients = "connectionClients",
	roomClients = "roomClients",
	connectionCount = "connectionCount",
	disconnectReason = "disconnectReason",

	// Session properties
	sessionState = "sessionState",
	sessionEndReason = "sessionEndReason",

	// Post checkpoint properties
	minSequenceNumber = "minSequenceNumber",
	sequenceNumber = "sequenceNumber",
	checkpointOffset = "checkpointOffset",

	// Summary properties
	clientSummarySuccess = "clientSummarySuccess",
	serviceSummarySuccess = "serviceSummarySuccess",
	maxOpsSinceLastSummary = "maxOpsSinceLastSummary",
	lastSummarySequenceNumber = "lastSummarySequenceNumber",

	// Logtail properties
	minLogtailSequenceNumber = "minLogtailSequenceNumber",
	maxLogtailSequenceNumber = "maxLogtailSequenceNumber",

	// Request properties
	statusCode = "statusCode",

	// Miscellaneous properties
	errorCode = "errorCode",
	restart = "restart",
	serviceName = "serviceName",
	telemetryGroupName = "telemetryGroupName",
	totalBatchSize = "totalBatchSize",
	isEphemeralContainer = "isEphemeralContainer",
	restartReason = "restartReason",
	errorLabel = "errorLabel",
	isGlobalDb = "isGlobalDb",
	internalErrorCode = "internalErrorCode",
}

/**
 * @internal
 */
export enum ThrottlingTelemetryProperties {
	// Use throttleId as key
	key = "key",

	// Throttle reason
	reason = "reason",

	// Retry after in seconds
	retryAfterInSeconds = "retryAfterInSeconds",

	// Log throttleOptions.weight
	weight = "weight",
}

/**
 * @internal
 */
export enum SessionState {
	// State set when the document lambdas are up and first op for the document is ticketed
	started = "started",

	// Resumed existing session
	resumed = "resumed",

	// State set when a kafka rebalance is triggered or the node process exits
	paused = "paused",

	// State set when the session ends
	end = "end",

	// State set when a lambda could not start successfully
	LambdaStartFailed = "lambdaStartFailed",
}

// Implementations of ILumberjackEngine are used by Lumberjack and Lumber
// to process and emit collected data to the appropriate transports.
/**
 * @internal
 */
export interface ILumberjackEngine {
	emit(lumber: Lumber<string>): void;
}

// Implementations of ILumberjackSchemaValidator are used by Lumber to validate the schema
// of the collected data/properties. The schema validation rules can be defined by each individual
// implementation.
/**
 * @internal
 */
export interface ILumberjackSchemaValidator {
	validate(props: Map<string, any>): ILumberjackSchemaValidationResult;
}

/**
 * @internal
 */
export interface ILumberjackSchemaValidationResult {
	validationPassed: boolean;
	validationFailedForProperties: string[];
}

// Helper method to assist with handling Lumberjack/Lumber errors depending on the context.
/**
 * @internal
 */
export function handleError(
	eventName: LumberEventName,
	errMsg: string,
	engineList: ILumberjackEngine[],
) {
	// We only want to log Lumberjack errors if running on a Fluid server instance.
	if (!isBrowser && isNode && process?.env?.IS_FLUID_SERVER) {
		const err = new Error(errMsg);
		// If there is no LumberjackEngine specified, making the list empty,
		// we log the error to the console as a last resort, so the information can
		// be found in raw logs.
		if (engineList.length === 0) {
			console.error(serializeError(err));
		} else {
			// Otherwise, we log the error through the current LumberjackEngines.
			const errLumber = new Lumber<LumberEventName>(eventName, LumberType.Metric, engineList);
			errLumber.error(errMsg, err);
		}
	}
}

// Helper method to add commonly used Lumber properties
/**
 * @internal
 */
export const getLumberBaseProperties = (documentId: string, tenantId: string) => ({
	[BaseTelemetryProperties.tenantId]: tenantId,
	[BaseTelemetryProperties.documentId]: documentId,
});

/**
 * @internal
 */
export interface ILumberFormatter {
	transform(lumber: Lumber<string>): void;
}
