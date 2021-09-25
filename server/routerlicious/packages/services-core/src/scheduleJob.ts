/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as cron from "node-cron";
import { ILogger } from "./lambdas";

export async function scheduleJob<T>(
    api: () => Promise<T>,
    callName: string,
    cronExpression: string,
    logger?: ILogger,
): Promise<void> {
    if (cron.getTasks()) {
        logger?.info(`cron tasks are ${JSON.stringify(cron.getTasks())}`);
        Lumberjack.info("hi");
    }
    cron.schedule("* * * * * ", api);
}
