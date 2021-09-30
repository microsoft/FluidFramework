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
    DeliHandler = "DeliHandler",
    ScribeHandler = "ScribeHandler",

    // Miscellaneous
    SessionResult = "SessionResult",
    StartSessionResult = "StartSessionResult",
    ScribeSessionResult = "ScribeSessionResult",
}
