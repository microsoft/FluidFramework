/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as nconf from "nconf";
import * as path from "path";
import * as raven from "raven";
import * as winston from "winston";
import { configureLogging } from "./logger";
import { testPragueService } from "./testService";

function getConfig(configFile: string): nconf.Provider {
    return nconf.argv().env("__" as any).file(configFile).use("memory");
}

function setup(): nconf.Provider {
    const config = getConfig(path.join(__dirname, "../config.json"));
    raven.config(config.get("notification:endpoint")).install();
    configureLogging(config.get("logger"));
    return config;
}

async function runInternal(config: nconf.Provider, retry: number, error: string): Promise<void> {
    winston.info(`Retry left: ${retry}`);
    if (retry === 0) {
        return Promise.reject(error);
    }
    const testP = testPragueService(config).then(() => {
        return;
    }, (err: string) => {
        return runInternal(config, retry - 1, err);
    });
    return testP;
}

async function run() {
    const maxRetry = 5;
    const config = setup();
    winston.info("Test started");
    try {
        await runInternal(config, maxRetry, null);
        winston.info("Success running test");
        process.exit(0);
    } catch (err) {
        raven.captureException(err);
        winston.error(err);
        // Wait to make sure that the exception is logged in sentry.
        setTimeout(() => {
            winston.error("Error running test. Shutting down!");
            process.exit(0);
        }, 30000);
    }
}

run();
