/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import commander from "commander";
import * as ps from "ps-node";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { ILoadTestConfig } from "./testConfigFile";
import { createTestDriver, getProfile, initialize, safeExit } from "./utils";
import { AppInsightsLogger } from "./appinsightslogger";

interface ITestUserConfig {
    /* Credentials' key/value description:
     * Key    : Username for the client
     * Value  : Password specific to that username
     */
    credentials: Record<string, string>;
    rampup: number;
    docUrl: string;
}

async function getTestUsers() {
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
        console.error("Failed to read testUserConfig.json");
        console.error(e);
        process.exit(-1);
    }
}

const createLoginEnv = (userName: string, password: string) => `{"${userName}": "${password}"}`;

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

    const testUsers = await getTestUsers();

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
    profile: ILoadTestConfig & { name: string, testUsers: ITestUserConfig },
    args: { testId?: string, debug?: true, verbose?: true, seed?: number, browserAuth?: true },
) {
    const telemetryClient = new AppInsightsLogger();

    const seed = args.seed ?? Date.now();
    const seedArg = `0x${seed.toString(16)}`;

    const userNames = Object.keys(profile.testUsers.credentials);

    {
        const userIndex = Math.floor(Math.random() * userNames.length);
        const userName = userNames[userIndex];
        const password = profile.testUsers.credentials[userName];
        process.env.login__odsp__test__accounts = createLoginEnv(userName, password);
    }

    const testDriver = await createTestDriver(
        driver,
        seed,
        undefined,
        args.browserAuth);
    let url = "";
    if (profile.testUsers.docUrl !== undefined && profile.testUsers.docUrl) {
        // if docUrl is found from config file then reuse this document
        url = profile.testUsers.docUrl;
    } else {
        // Create a new file if a testId wasn't provided
        url = args.testId !== undefined
            ? await testDriver.createContainerUrl(args.testId)
            : await initialize(testDriver, seed);
    }

    telemetryClient.setCommonProperty("url", url);

    const estRunningTimeMin = Math.floor(2 * profile.totalSendCount / (profile.opRatePerMin * profile.numClients));
    console.log(`Connecting to ${args.testId !== undefined ? "existing" : "new"}`);
    console.log(`Selected test profile: ${profile.name}`);
    console.log(`Estimated run time: ${estRunningTimeMin} minutes\n`);

    telemetryClient.trackMetric({
        name: `Orchestrator Started`,
        value: 1,
    });

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
    console.log(runnerArgs.join(" "));

    setInterval(() => {
        ps.lookup({
            command: "node",
            ppid: process.pid,
        }, (err, results) => {
            if (err !== undefined) {
                telemetryClient.trackMetric({
                    name: "Runner Processes",
                    value: results.length,
                });
                console.log(`Runner Processes: ${results.length}`);
            }
        });
    }, 20000);

    try {
        const startIndex = Math.floor(Math.random() * userNames.length);
        await Promise.all(runnerArgs.map(async (childArgs, index) => {
            await new Promise<void>((resolve) => setTimeout(resolve, 5000 + Math.random() * 10000));

            const userName = userNames[(index + startIndex) % userNames.length];
            const password: string = profile.testUsers.credentials[userName];

            const homeDir = path.join(os.homedir(), "fluidStressTest", userName);

            await new Promise<void>((resolve, reject) => {
                fs.mkdir(homeDir, {
                    recursive: true,
                }, (err) => {
                    if (!err) {
                        resolve();
                    } else {
                        reject(err);
                    }
                });
            });

            const childProcess = child_process.spawn(
                "node",
                childArgs,
                {
                    env: {
                        ...process.env,
                        HOME: homeDir,
                        USERPROFILE: homeDir,
                        login__odsp__test__accounts: createLoginEnv(userName, password),
                    },
                });

            telemetryClient.trackMetric({
                name: `Runner Started`,
                value: 1,
                properties: {
                    userName,
                    runId: index,
                },
            });

            childProcess.once("error", (e) => {
                telemetryClient.trackMetric({
                    name: `Runner Start Error`,
                    value: 1,
                    properties: {
                        userName,
                        runId: index,
                        error: e,
                    },
                });
            });

            childProcess.once("exit", (code) => {
                telemetryClient.trackMetric({
                    name: `Runner Exited`,
                    value: 1,
                    properties: {
                        userName,
                        runId: index,
                        exitCode: code,
                    },
                });
            });

            setIoEvents(childProcess, telemetryClient, index, userName);
            return new Promise((resolve) => childProcess.once("close", resolve));
        }));
    } catch (e) {
        telemetryClient.trackMetric({
            name: `Orchestrator Error`,
            value: 1,
            properties: {
                error: e,
            },
        });
    } finally {
        telemetryClient.trackMetric({
            name: `Orchestrator Exited`,
            value: 1,
        });
        await telemetryClient.flush();
        await safeExit(0, url);
    }
}

function setIoEvents(
    process: child_process.ChildProcessWithoutNullStreams,
    telemetryClient: AppInsightsLogger,
    runId: number,
    userName: string) {
    let stdOutLine = 0;
    process.stdout.on("data", (chunk) => {
        const data = String(chunk);
        console.log(data);
        if (data.replace(/\./g, "").length > 0) {
            telemetryClient.send({
                eventName: "Runner Console",
                category: "generic",
                lineNo: stdOutLine,
                runId,
                userName,
                data,
            });
            stdOutLine++;
        }
    });

    let stdErrLine = 0;
    process.stderr.on("data", (chunk) => {
        const data = String(chunk);
        console.log(data);
        telemetryClient.send({
            eventName: "Runner Error",
            category: "error",
            lineNo: stdErrLine,
            runId,
            userName,
            data,
            error: data.split("\n")[0],
        });
        stdErrLine++;
    });
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
