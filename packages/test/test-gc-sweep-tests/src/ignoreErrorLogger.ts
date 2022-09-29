/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";

/**
 * Ignores certain error types (does not pay attention to count)
 * Potentially, we may want to raise the severity of telemetry as an error. i.e - inactiveObjectX telemetry
 */
export class IgnoreErrorLogger extends EventAndErrorTrackingLogger {
    public readonly events: ITelemetryBaseEvent[] = [];
    public readonly inactiveObjectEvents: ITelemetryBaseEvent[] = [];
    public readonly errorEvents: ITelemetryBaseEvent[] = [];
    public readonly errorEventStats: { [key: string]: number; } = {};

    public send(event: ITelemetryBaseEvent): void {
        this.events.push(event);
        if (event.eventName.includes("InactiveObject")) {
            this.inactiveObjectEvents.push(event);
        }

        // Ignore all errors, otherwise we only run one test.
        if (event.category === "error") {
            const count = this.errorEventStats[event.eventName] ?? 0;
            this.errorEventStats[event.eventName] = count + 1;
            this.errorEvents.push(event);
        }
    }

    public logEvents(seed: number): void {
        fs.mkdirSync(`nyc/testData-${seed}`, { recursive: true });
        fs.writeFileSync(`nyc/testData-${seed}/events.json`, JSON.stringify(this.events));
        fs.writeFileSync(`nyc/testData-${seed}/inactiveObjectEvents.json`, JSON.stringify(this.inactiveObjectEvents));
        fs.writeFileSync(`nyc/testData-${seed}/errorEvents.json`, JSON.stringify(this.errorEvents));
        fs.writeFileSync(`nyc/testData-${seed}/errorEventStats.json`, JSON.stringify(this.errorEventStats));
    }

    public validateEvents(seed: number): void {
        assert(this.inactiveObjectEvents.length === 0,
            `InactiveObject events occurred - look at nyc/testData-${seed}/inactiveObjectEvents.json`);
        assert(this.errorEvents.length === 0,
            `Error events occurred - look at nyc/testData-${seed}/errorEvents.json`);
    }
}
