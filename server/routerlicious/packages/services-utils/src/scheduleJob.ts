/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as cron from "node-cron";
import { ILogger } from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export async function scheduleJob<T>(
    api: () => Promise<T>,
    config: Provider,
    featureGateConfigName: string,
    callName: string,
    cronExpressionConfigName: string,
    logger?: ILogger,
): Promise<any> {
    let task;
    if (config.get(featureGateConfigName)) {
        const cronExpression = config.get(cronExpressionConfigName);
        try {
            if (cron.validate(cronExpression)) {
                task = cron.schedule(cronExpression, api);
                logger?.info(`Task ${callName} is scheduled, cron expression is ${cronExpression}`);
                Lumberjack.info(`Task ${callName} is scheduled, cron expression is ${cronExpression}`);
            } else {
                return Promise.reject(new Error(`Invalid cron expression ${cronExpression}`));
            }
        } catch (error) {
            logger?.error(`Error scheduling cron job for ${callName}, error ${error}`);
            Lumberjack.error(`Error scheduling cron job for ${callName}`, undefined, error);
            return Promise.reject(error);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return task;
}
