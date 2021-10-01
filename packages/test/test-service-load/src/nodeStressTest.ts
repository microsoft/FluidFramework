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
 * Implementation of the orchestrator process. Returns the return code to exit the process with.
 */
async function orchestratorProcess(
    driver: TestDriverTypes,
    profile: ILoadTestConfig & { name: string },
    args: { testId?: string, debug?: true, verbose?: true, seed?: number, browserAuth?: true },
) {
    const start = Date.now();
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

        // 600 / (60 * 10)
    const estRunningTimeMin = 2 * profile.totalSendCount / (profile.opRatePerMin * profile.numClients);
    console.log(`Connecting to ${args.testId !== undefined ? "existing" : "new"}`);
    console.log(`Selected test profile: ${profile.name}`);
    console.log(`Estimated run time: ${printTime(estRunningTimeMin * 60)}\n`);

    const runnerArgs: string[][] = [];
    for (let i = 0; i < profile.numClients; i++) {
        const childArgs: string[] = [
            "--trace-warnings",
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
        if(args.verbose === true) {
            childArgs.push("--verbose");
        }

        runnerArgs.push(childArgs);
    }
    console.log(runnerArgs[0].join(" "));
    const finished: boolean[] = new Array(profile.numClients).fill(false);
    const times: number[] = new Array(profile.numClients).fill(Date.now());
    const tasks: string[][] = Array.from(Array(profile.numClients), () => []);
    const taskLength = 5;

    let prevClientsDone = 0;
    let finishedP: Promise<void>[];
    const timeLimitMs = 55 * 60 * 1000;
    try{
        const processes = await Promise.all(runnerArgs.map(async (childArgs) => {
            const process = child_process.spawn(
                "node",
                childArgs,
                { stdio: args.verbose === true ? ["ipc", "inherit", "inherit"] : "inherit" },
            );
            process.on("message", (message) => {
                if (message?.runId !== undefined && message?.task !== undefined) {
                    if (message.task === "count") {
                        times[message.runId] = Date.now();
                    }
                    tasks[message.runId].push(message.task);
                    while (tasks[message.runId].length > taskLength) {
                        tasks[message.runId].shift();
                    }
                } else {
                    console.log(`unrecognized message: ${JSON.stringify(message)}`);
                }
            });
            return process;
        }));
        finishedP = processes.map(async (process, i) => {
            return new Promise((resolve) => process.once("close", () => {
                finished[i] = true;
                resolve();
            }));
        });

        const killAll = (reason: string) => {
            console.log(`Cancelling run: ${reason}`);
            const time = (Date.now() - start) / 1000;
            const diff = time - estRunningTimeMin * 60;
            console.log(`ran for ${printTime(time)}`, diff > 0 ? `(${printTime(diff)} more than estimated)` : "");
            processes.map((p) => p.kill());
            process.exit(-1);
        };
        process.on("SIGINT", () => killAll("interrupted by user"));
        setTimeout(() => killAll("test timeout"), timeLimitMs);

        if (args.verbose !== true) {
            await Promise.all(finishedP);
        } else {
            while (finished.some((b) => !b)) {
                await Promise.race([
                    ...(finishedP.filter((_, i) => !finished[i])),
                    new Promise((res) => setTimeout(res, profile.readWriteCycleMs)),
                ]);
                const someCyclesAgo = Date.now() - profile.readWriteCycleMs * 10;
                const stalled = [...Array(profile.numClients).keys()]
                    .filter((i) => !finished[i] && times[i] < someCyclesAgo).sort((a, b) => times[a] - times[b]);

                const printStalled = (a: number[]) => {
                    const partner = (i: number) => (i + (profile.numClients / 2)) % profile.numClients;
                    return `[ ${a.map((i) => {
                        const partnerString = a.indexOf(partner(i)) < 0 ? ` (${tasks[partner(i)].join("->")})` : "";
                        return `${i} (${tasks[i].join("->")})${partnerString}`;
                    }).join(", ")} ]`;
                };
                if (stalled.length > 0) {
                    console.log("-".repeat(120));
                    console.log(`${stalled.length} stalled: ${printStalled(stalled)}`.padEnd(120, "-"));
                    console.log("-".repeat(120));
                }
                const clientsDone = finished.filter((b) => b).length;
                if (clientsDone > prevClientsDone) {
                    console.log(`${clientsDone}/${profile.numClients} clients finished `.padEnd(120, "="));
                    prevClientsDone = clientsDone;
                }
            }
        }
    } finally{
        const time = (Date.now() - start) / 1000;
        const diff = time - estRunningTimeMin * 60;
        console.log(
            `took ${printTime(time)} (${printTime(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than estimated)`);
        await safeExit(0, url);
    }
}

function printTime(seconds: number): string {
        if (seconds >= 60) {
            return `${Math.floor(seconds / 60)} minutes ${(seconds % 60).toFixed(1)} seconds`;
        } else {
            return `${(seconds % 60).toFixed(1)} seconds`;
        }
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
