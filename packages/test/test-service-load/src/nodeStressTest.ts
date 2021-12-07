/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import fs from "fs";
import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { ILoadTestConfig } from "./testConfigFile";
import { createTestDriver, getProfile, initialize, safeExit } from "./utils";

interface ITestUserConfig {
    /* Credentials' key/value description:
     * Key    : Username for the client
     * Value  : Password specific to that username
     */
    credentials: Record<string, string>;
}

async function getTestUsers(credFile?: string) {
    if (credFile === undefined || credFile.length === 0) {
        return undefined;
    }

    let config: ITestUserConfig;
    try {
        config = JSON.parse(await new Promise<string>((resolve, reject) =>
            fs.readFile("./testUserConfig.json", "utf8", (err, data) => {
                if (!err) {
                    resolve(data);
                } else {
                    reject(err);
                }
            })));
        return config;
    } catch (e) {
        console.error(`Failed to read ${credFile}`);
        console.error(e);
        return undefined;
    }
}

const createLoginEnv = (userName: string, password: string) => `{"${userName}": "${password}"}`;

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .option("-id, --testId <testId>", "Load an existing data store rather than creating new")
        .option("-c, --credFile <filePath>", "Filename containing user credentialss for test")
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
    const credFile: string | undefined = commander.credFile;

    const profile = getProfile(profileArg);

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    const testUsers = await getTestUsers(credFile);

    await orchestratorProcess(
            driver,
            { ...profile, name: profileArg, testUsers },
            { testId, debug, verbose, seed, browserAuth });
}
/**
 * Implementation of the orchestrator process. Returns the return code to exit the process with.
 */
async function orchestratorProcess(
    driver: TestDriverTypes,
    profile: ILoadTestConfig & { name: string, testUsers?: ITestUserConfig },
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
        : await initialize(testDriver, seed, profile, args.verbose === true);

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
        const usernames = profile.testUsers !== undefined ? Object.keys(profile.testUsers.credentials) : undefined;
        await Promise.all(runnerArgs.map(async (childArgs, index) => {
            const username = usernames !== undefined ? usernames[index % usernames.length] : undefined;
            const password = username !== undefined ? profile.testUsers?.credentials[username] : undefined;
            const envVar = { ...process.env };
            if (username !== undefined && password !== undefined) {
                envVar.login__odsp__test__accounts = createLoginEnv(username, password);
            }
            const runnerProcess = child_process.spawn(
                "node",
                childArgs,
                {
                    stdio: "inherit",
                    env: envVar,
                },
            );
            return new Promise((resolve) => runnerProcess.once("close", resolve));
        }));
    } finally{
        await safeExit(0, url);
    }
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
