/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import nconf from "nconf";
import * as Sentry from "@sentry/node";
import * as winston from "winston";
import { configureLogging } from "@fluidframework/server-services-utils";
import { testFluidService } from "./testService";

const provider = nconf.argv().env("__" as any).file(path.join(__dirname, "../config.json")).use("memory");

async function runInternal(config: nconf.Provider, retry: number, error?: string): Promise<void> {
    winston.info(`Retry left: ${retry}`);
    if (retry === 0) {
        return Promise.reject(error);
    }
    const testP = testFluidService(config).then(() => {
        return;
    }, async (err: string) => {
        return runInternal(config, retry - 1, err);
    });
    return testP;
}

async function run() {
    configureLogging(provider.get("logger"));

    // Setup notification if available
    const notify: boolean = provider.get("notification:enabled");
    if (notify) {
        Sentry.init({ dsn: provider.get("notification:endpoint") });
    }

    const maxRetry = 5;
    try {
        await runInternal(provider, maxRetry);
        winston.info("Success running test");
        process.exit(0);
    } catch (err) {
        winston.error("Error running test");
        winston.error(err);
        if (notify) {
            Sentry.captureMessage(err);
            // Wait to make sure that the exception is logged in sentry.
            setTimeout(() => {
                process.exit(0);
            }, 30000);
        } else {
            process.exit(0);
        }
    }
}

run(); // eslint-disable-line @typescript-eslint/no-floating-promises
