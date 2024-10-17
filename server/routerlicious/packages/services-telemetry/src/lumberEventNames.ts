/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// List of event names that should identify Lumber events throughout the code.
// Values in the enum must be strings.
/**
 * @internal
 */
export enum LumberEventName {
	// Lumberjack infrastructure and helpers
	LumberjackError = "LumberjackError",
	LumberjackSchemaValidationFailure = "LumberjackSchemaValidationFailure",

	// Fluid server infrastructure
	RunService = "RunService",
	GracefulShutdown = "GracefulShutdown",

	// Unit Testing
	UnitTestEvent = "UnitTestEvent",

	// Lambdas
	AlfredRunner = "AlfredRunner",
	ClientSummary = "ClientSummary",
	DeliHandler = "DeliHandler",
	KafkaRunner = "KafkaRunner",
	NexusRunner = "NexusRunner",
	RiddlerRunner = "RiddlerRunner",
	ScribeHandler = "ScribeHandler",
	ServiceSummary = "ServiceSummary",
	SummaryReader = "SummaryReader",
	ScriptoriumProcessBatch = "ScriptoriumProcessBatch",

	// Retries
	RunWithRetry = "RunWithRetry",
	RequestWithRetry = "RequestWithRetry",

	// Reliability
	SessionResult = "SessionResult",
	StartSessionResult = "StartSessionResult",
	ScribeSessionResult = "ScribeSessionResult",

	// Collaboration Sessions
	NexusSessionStart = "NexusSessionStart",
	NexusSessionResult = "NexusSessionResult",

	// Session Discovery
	GetSession = "GetSession",
	VerifyStorageToken = "VerifyStorageToken",

	// Miscellaneous
	ConnectDocument = "ConnectDocument",
	ConnectDocumentAddClient = "ConnectDocumentAddClient",
	ConnectDocumentGetClients = "ConnectDocumentGetClients",
	ConnectDocumentOrdererConnection = "ConnectDocumentOrdererConnection",
	CreateDocumentUpdateDocumentCollection = "CreateDocumentUpdateDocumentCollection",
	CreateDocInitialSummaryWrite = "CreateDocInitialSummaryWrite",
	DisconnectDocument = "DisconnectDocument",
	DisconnectDocumentRetry = "DisconnectDocumentRetry",
	RiddlerFetchTenantKey = "RiddlerFetchTenantKey",
	HttpRequest = "HttpRequest",
	SocketConnection = "SocketConnection",
	SocketConnectionCount = "SocketConnectionCount",
	TotalConnectionCount = "TotalConnectionCount",
	ConnectionCountPerNode = "ConnectionCountPerNode",
	RestoreFromCheckpoint = "RestoreFromCheckpoint",
	GlobalCheckpointError = "GlobalCheckpointError",
	ReprocessOps = "ReprocessOps",
	MongoMonitoring = "MongoMonitoring",
	StartupProbe = "StartupProbe",
	LivenessProbe = "LivenessProbe",
	ReadinessProbe = "ReadinessProbe",
	CircuitBreaker = "CircuitBreaker",
}
