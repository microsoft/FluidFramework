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

    // Reliability
    SessionResult = "SessionResult",
    StartSessionResult = "StartSessionResult",
    ScribeSessionResult = "ScribeSessionResult",

    // Miscellaneous
    ConnectDocument = "ConnectDocument",
    HttpRequest = "HttpRequest",
}
