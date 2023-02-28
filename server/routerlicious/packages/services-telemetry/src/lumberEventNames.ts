/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// List of event names that should identify Lumber events throughout the code.
// Values in the enum must be strings.
export enum LumberEventName {
    // Lumberjack infrastructure and helpers
    LumberjackError = "LumberjackError",
    LumberjackSchemaValidationFailure = "LumberjackSchemaValidationFailure",

    // Fluid server infrastructure
    RunService = "RunService",

    // Unit Testing
    UnitTestEvent = "UnitTestEvent",

    // Lambdas
    ClientSummary = "ClientSummary",
    DeliHandler = "DeliHandler",
    KafkaRunner = "KafkaRunner",
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

    // Miscellaneous
    ConnectDocument = "ConnectDocument",
    ConnectDocumentAddClient = "ConnectDocumentAddClient",
    ConnectDocumentGetClients = "ConnectDocumentGetClients",
    ConnectDocumentOrdererConnection = "ConnectDocumentOrdererConnection",
    CreateDocumentUpdateDocumentCollection = "CreateDocumentUpdateDocumentCollection",
    CreateDocInitialSummaryWrite = "CreateDocInitialSummaryWrite",
    RiddlerFetchTenantKey = "RiddlerFetchTenantKey",
    HttpRequest = "HttpRequest",
    TotalConnectionCount = "TotalConnectionCount",
    ConnectionCountPerNode = "ConnectionCountPerNode",
}
