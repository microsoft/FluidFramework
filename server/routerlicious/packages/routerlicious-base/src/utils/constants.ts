/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const ONE_MILLION = 100000;

export const Constants = Object.freeze({
    alfredRestThrottleIdSuffix: "AlfredRest",
    defaultThrottling: Object.freeze({
        rateInOperationsPerMs: ONE_MILLION,
        operationBurstLimit: ONE_MILLION,
        minCooldownIntervalInMs: ONE_MILLION,
        minThrottleIntervalInMs: ONE_MILLION,
    }),
});
