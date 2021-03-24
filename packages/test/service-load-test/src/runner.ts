/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { ILoadTestConfig } from "./testConfigFile";
import { IRunConfig } from "./loadTestDataStore";
import { createTestDriver, getProfile, load, safeExit } from "./utils";

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .requiredOption("-u --url <url>", "Load an existing data store from the url")
        .requiredOption("-r, --runId <runId>", "run a child process with the given id. Requires --url option.")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const profileArg: string = commander.profile;
    const url: string = commander.url;
    const runId: number  = commander.runId;
    const log: string | undefined = commander.log;

    const profile = getProfile(profileArg);

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    if (url === undefined) {
        console.error("Missing --url argument needed to run child process");
        process.exit(-1);
    }
    const result = await runnerProcess(driver, profile, runId, url);

    await safeExit(result, url, runId);
}

/**
 * Implementation of the runner process. Returns the return code to exit the process with.
 */
async function runnerProcess(
    driver: TestDriverTypes,
    profile: ILoadTestConfig,
    runId: number,
    url: string,
): Promise<number> {
    try {
        const runConfig: IRunConfig = {
            runId,
            testConfig: profile,
        };

        const testDriver = await createTestDriver(driver);

        const stressTest = await load(testDriver, url, runId);
        await stressTest.run(runConfig, true);
        console.log(`${runId.toString().padStart(3)}> exit`);
        return 0;
    } catch (e) {
        console.error(`${runId.toString().padStart(3)}> error: loading test`);
        console.error(e);
        return -1;
    }
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
