/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as appinsights from "applicationinsights";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

/**
 * Logger to send events to Azure Application Insights.
 * Can be used by defining env var as: FLUID_TEST_LOGGER_PKG_PATH='./azureapplicationinsights'
 * Define instrumentation key in env var as: APPINSIGHTS_INSTRUMENTATIONKEY='<instrumentation key>'.
 */
export class AppInsightsLogger extends TelemetryLogger implements ITelemetryBufferedLogger {
    private readonly telemetryClient: appinsights.TelemetryClient;

    public constructor() {
        super();

        // Make sure APPINSIGHTS_INSTRUMENTATIONKEY is specified in environment variables.
        appinsights.setup().start();
        this.telemetryClient = appinsights.defaultClient;

        // Set uid for test. if any.
        if (process.env.FLUID_TEST_UID !== undefined) {
            this.telemetryClient.commonProperties.testUid = process.env.FLUID_TEST_UID;
        }
    }

    async flush(runInfo?: { url: string, runId?: number }): Promise<void> {
        await new Promise<void>((resolve) => {
            this.telemetryClient.flush({
                callback: () => resolve(),
            });
        });
    }

    send(event: ITelemetryBaseEvent): void {
        event.Event_Time = Date.now();
        this.telemetryClient.trackEvent({
            name: event.eventName,
            tagOverrides: {
                category: event.category,
            },
            properties: event,
        });
    }
}

const _global: any = global;
_global.getTestLogger = () => new AppInsightsLogger();
