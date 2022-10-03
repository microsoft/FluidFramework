/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import crypto from "crypto";
import fs from "fs";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { LazyPromise, assert } from "@fluidframework/common-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

import { pkgName, pkgVersion } from "./packageVersion";

export interface LoggerConfig {
    scenarioName?: string;
    namespace?: string;
    runId?: string;
}

class FileLogger extends TelemetryLogger implements ITelemetryBufferedLogger {
    private error: boolean = false;
    private readonly schema = new Map<string, number>();
    private targetEvents: string[] = [];
    private logs: ITelemetryBaseEvent[] = [];

    public constructor(private readonly baseLogger?: ITelemetryBufferedLogger) {
        super(undefined /* namespace */, { all: { testVersion: pkgVersion } });
    }

    public registerExpectedEvent(expectedEventNames: string[]) {
        this.targetEvents = expectedEventNames;
    }

    async flush(runInfo?: { url: string; runId?: number }): Promise<void> {
        // console.log("event----", this.targetEvents);
        const baseFlushP = this.baseLogger?.flush();

        if (this.error && runInfo !== undefined) {
            const logs = this.logs;
            const outputDir = `${__dirname}/output/${crypto
                .createHash("md5")
                .update(runInfo.url)
                .digest("hex")}`;
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            // sort from most common column to least common
            const schema = [...this.schema].sort((a, b) => b[1] - a[1]).map((v) => v[0]);
            const data = logs.reduce(
                (file, event) =>
                    `${file}\n${schema.reduce((line, k) => `${line}${event[k] ?? ""},`, "")}`,
                schema.join(","),
            );
            const filePath = `${outputDir}/${runInfo.runId ?? "orchestrator"}_${Date.now()}.csv`;
            fs.writeFileSync(filePath, data);
        }
        this.schema.clear();
        this.error = false;
        this.logs = [];
        return baseFlushP;
    }

    send(event: ITelemetryBaseEvent): void {
        if (this.targetEvents.length > 0) {
            const found = this.targetEvents.find((a) => event.eventName.startsWith(a));
            if (!found) {
                return;
            }
        }

        if (typeof event.testCategoryOverride === "string") {
            event.category = event.testCategoryOverride;
        } else if (
            typeof event.message === "string" &&
            event.message.includes("FaultInjectionNack")
        ) {
            event.category = "generic";
        }
        this.baseLogger?.send({ ...event, hostName: pkgName });

        event.Event_Time = Date.now();
        // keep track of the frequency of every log event, as we'll sort by most common on write
        Object.keys(event).forEach((k) => this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
        if (event.category === "error") {
            this.error = true;
        }
        this.logs.push(event);
    }
}

export const loggerP = new LazyPromise<FileLogger>(async () => {
    if (process.env.FLUID_TEST_LOGGER_PKG_PATH !== undefined) {
        await import(process.env.FLUID_TEST_LOGGER_PKG_PATH);
        const logger = getTestLogger?.();
        assert(logger !== undefined, "Expected getTestLogger to return something");
        return new FileLogger(logger);
    } else {
        return new FileLogger();
    }
});

export async function getLogger(config: LoggerConfig, events?: string[]): Promise<TelemetryLogger> {
    const baseLogger = await loggerP;
    if(events) {
        baseLogger.registerExpectedEvent(events);
    }
    return ChildLogger.create(baseLogger, config.namespace, {
        all: {
            runId: config.runId,
            scenarioName: config.scenarioName,
        },
    });
}
