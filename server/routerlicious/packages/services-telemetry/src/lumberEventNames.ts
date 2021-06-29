/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// List of event names that should identify Lumber events throughout the code.
// Values in the enum must be strings.
export enum LumberEventName {
    // Infrastructure and helpers
    LumberjackError = "LumberjackError",
    LumberjackSchemaValidationFailure = "LumberjackSchemaValidationFailure",

    // Unit Testing
    UnitTestEvent = "UnitTestEvent",
}
