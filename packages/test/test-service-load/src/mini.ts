/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { ILoadTestConfig } from "./testConfigFile";
import { createTestDriver, getProfile, initialize, safeExit } from "./utils";

describe("stress test", () => {
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
            .parse(process.argv);

        const driver = "tinylicious";
        const profileArg: string = "mini";
        const testId: string | undefined = commander.testId;
        const debug: true | undefined = commander.debug;
        const log: string | undefined = commander.log;
        const verbose: true | undefined = commander.verbose;
        const seed: number | undefined = commander.seed;

        const profile = getProfile(profileArg);

        if (log !== undefined) {
            process.env.DEBUG = log;
        }

        const code = await orchestratorProcess(
                driver,
                { ...profile, name: profileArg },
                { testId, debug, verbose, seed });
            console.log("orch code is ", code);
        return code;
    }
    /**
     * Implementation of the orchestrator process. Returns the return code to exit the process with.
     */
    async function orchestratorProcess(
        driver: TestDriverTypes,
        profile: ILoadTestConfig & { name: string },
        args: { testId?: string, debug?: true, verbose?: true, seed?: number },
    ) {
        const seed = args.seed ?? Date.now();
        const seedArg = `0x${seed.toString(16)}`;

        const testDriver = await createTestDriver(
            driver,
            seed,
            undefined);

        // Create a new file if a testId wasn't provided
        const url = args.testId !== undefined
            ? await testDriver.createContainerUrl(args.testId)
            : await initialize(testDriver, seed);

        const estRunningTimeMin = Math.floor(2 * profile.totalSendCount / (profile.opRatePerMin * profile.numClients));
        console.log(`Connecting to ${args.testId ? "existing" : "new"} with seed 0x${seed.toString(16)}`);
        console.log(`Container targeting with url: ${url }`);
        console.log("Seed: ", seedArg);
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
            if (args.debug) {
                const debugPort = 9230 + i; // 9229 is the default and will be used for the root orchestrator process
                childArgs.unshift(`--inspect-brk=${debugPort}`);
            }
            if(args.verbose) {
                childArgs.push("--verbose");
                console.log(childArgs.join(" "));
            }

            runnerArgs.push(childArgs);
        }
        try{
            await Promise.all(runnerArgs.map(async (childArgs)=>{
                const process = child_process.spawn(
                    "node",
                    childArgs,
                    { stdio: "inherit" },
                );
                console.log("try here");
                return new Promise((resolve) => process.once("close", resolve));
            }));
        } finally{
            console.log("finally here");
            await safeExit(0, url);
        }
    }

    it("Should return 0", async () => {
        const code = await main();
        console.log("code is", code);
    });
});
