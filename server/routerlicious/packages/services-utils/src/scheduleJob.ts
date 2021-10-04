/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as cron from "node-cron";

export async function scheduleJob(
    api: () => void,
    cronExpression: string,
    callName: string,
): Promise<cron.ScheduledTask> {
    let task: cron.ScheduledTask;
    try {
        if (cron.validate(cronExpression)) {
            task = cron.schedule(cronExpression, api);
            Lumberjack.info(`Task ${callName} is scheduled, cron expression is ${cronExpression}`);
        } else {
            throw new Error(`Invalid cron expression ${cronExpression}`);
        }
    } catch (error) {
        Lumberjack.error(`Error scheduling cron job for ${callName}`, undefined, error);
        return Promise.reject(error);
    }
    return task;
}
