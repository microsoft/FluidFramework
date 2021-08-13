/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IServiceConfiguration } from "@fluidframework/server-services-core";
import {
    BaseTelemetryProperties,
    Lumber,
    LumberEventName,
    Lumberjack,
} from "@fluidframework/server-services-telemetry";

export const createSessionMetric = (
    tenantId: string,
    documentId: string,
    isStartSession: boolean,
    serviceConfiguration: IServiceConfiguration,
): Lumber<any> | undefined => {
    if (!serviceConfiguration.enableLumberMetrics) {
        return;
    }

    const sessionMetric = isStartSession ? Lumberjack.newLumberMetric(LumberEventName.StartSessionResult)
        : Lumberjack.newLumberMetric(LumberEventName.SessionResult);
    sessionMetric?.setProperties({
        [BaseTelemetryProperties.tenantId]: tenantId,
        [BaseTelemetryProperties.documentId]: documentId,
    });

    return sessionMetric;
};
