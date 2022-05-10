/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as appinsights from "applicationinsights";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

export class AppInsightsTestLogger implements ITelemetryBufferedLogger {
    protected readonly telemetryClient: appinsights.TelemetryClient;

    public constructor() {
        // This will fail if env var APPINSIGHTS_INSTRUMENTATIONKEY is not set.
        appinsights.setup().start();
        this.telemetryClient = appinsights.defaultClient;

        // Set testUid (if available) for all events to collate the data.
        if (process.env.FLUID_TEST_UID !== undefined) {
            this.telemetryClient.commonProperties.testUid = process.env.FLUID_TEST_UID;
        }

        // Get username from provided in env var.
        if (process.env.login__odsp__test__accounts !== undefined) {
            const passwords: { [user: string]: string; } = JSON.parse(process.env.login__odsp__test__accounts);
            const users = Object.keys(passwords);
            const username = users[0];
            this.telemetryClient.commonProperties.envUserName = username;
        }
    }

    async flush(runInfo?: { url: string; runId?: number; }): Promise<void> {
        // await until data is posted to the server.
        await new Promise<void>((resolve) => {
            this.telemetryClient.flush({
                callback: () => resolve(),
            });
        });
    }

    send(event: ITelemetryBaseEvent): void {
        event.Event_Time = Date.now();
        if (event.category === "metric") {
            this.telemetryClient.trackMetric({
                name: event.eventName,
                value: event.value as number,
                tagOverrides: {
                    category: event.category,
                },
                properties: event,
            });
        } else {
            this.telemetryClient.trackEvent({
                name: event.eventName,
                tagOverrides: {
                    category: event.category,
                },
                properties: event,
            });
        }
    }
}

const _global: any = global;
_global.getTestLogger = () => new AppInsightsTestLogger();
