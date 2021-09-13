/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { ILoadTestConfig } from "./testConfigFile";
import { createTestDriver, getProfile, initialize, safeExit } from "./utils";

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .option("-id, --testId <testId>", "Load an existing data store rather than creating new")
        .option("-s, --seed <number>", "Seed for this run")
        .option("-dbg, --debug", "Debug child processes via --inspect-brk")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .option("-v, --verbose", "Enables verbose logging")
        .option("-b, --browserAuth", "Enables browser auth which may require a user to open a url in a browser.")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const profileArg: string = commander.profile;
    const testId: string | undefined = commander.testId;
    const debug: true | undefined = commander.debug;
    const log: string | undefined = commander.log;
    const verbose: true | undefined = commander.verbose;
    const seed: number | undefined = commander.seed;
    const browserAuth: true | undefined = commander.browserAuth;

    const profile = getProfile(profileArg);

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    await orchestratorProcess(
            driver,
            { ...profile, name: profileArg },
            { testId, debug, verbose, seed, browserAuth });
}

/**
 * Implementation of the orchestrator process.
 */
async function orchestratorProcess(
    driver: TestDriverTypes,
    profile: ILoadTestConfig & { name: string },
    args: { testId?: string, debug?: true, verbose?: true, seed?: number, browserAuth?: true },
) {
    const seed = args.seed ?? Date.now();
    const seedArg = `0x${seed.toString(16)}`;

    const testDriver = await createTestDriver(
        driver,
        seed,
        undefined,
        args.browserAuth);

    // Create a new file if a testId wasn't provided
    const url = args.testId !== undefined
        ? await testDriver.createContainerUrl(args.testId)
        : await initialize(testDriver, seed);

    const estRunningTimeMin = Math.floor(2 * profile.totalSendCount / (profile.opRatePerMin * profile.numClients));
    console.log(`Connecting to ${args.testId !== undefined ? "existing" : "new"}`);
    console.log(`Selected test profile: ${profile.name}`);
    console.log(`Estimated run time: ${estRunningTimeMin} minutes\n`);

    const runnerArgs: string[][] = [];
    for (let i = 0; i < profile.numClients; i++) {
        const childArgs: string[] = [
            "./dist/runner.js",
            "--driver", driver,
            "--profile", profile.name,
            "--runId", i.toString(),
            "--url", url,
            "--seed", seedArg,
        ];
        if (args.debug === true) {
            const debugPort = 9230 + i; // 9229 is the default and will be used for the root orchestrator process
            childArgs.unshift(`--inspect-brk=${debugPort}`);
        }
        if (args.verbose === true) {
            childArgs.push("--verbose");
        }

        runnerArgs.push(childArgs);
    }
    console.log(runnerArgs[0].join(" "));
    try {
        await Promise.all(runnerArgs.map(async (childArgs) => {
            const process = child_process.spawn(
                "node",
                childArgs,
                { stdio: "inherit" },
            );
            return new Promise((resolve) => process.once("close", resolve));
        }));
    } finally {
        await safeExit(0, url);
    }
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
