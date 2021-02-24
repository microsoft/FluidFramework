/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import child_process from "child_process";
import commander from "commander";
import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { LocalCodeLoader } from "@fluidframework/test-utils";
import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createFluidTestDriver } from "@fluidframework/test-drivers";
import { pkgName, pkgVersion } from "./packageVersion";
import { ITestConfig, ILoadTestConfig } from "./testConfigFile";
import { IRunConfig, fluidExport, ILoadTest } from "./loadTestDataStore";

const packageName = `${pkgName}@${pkgVersion}`;

const codeDetails: IFluidCodeDetails = {
    package: packageName,
    config: {},
};

const codeLoader = new LocalCodeLoader([[codeDetails, fluidExport]]);

function createLoader(testDriver: ITestDriver) {
    // Construct the loader
    const loader = new Loader({
        urlResolver: testDriver.createUrlResolver(),
        documentServiceFactory: testDriver.createDocumentServiceFactory(),
        codeLoader,
    });
    return loader;
}

async function initialize(testDriver: ITestDriver) {
    const loader = createLoader(testDriver);
    const container = await loader.createDetachedContainer(codeDetails);
    container.on("error", (error) => {
        console.log(error);
        process.exit(-1);
    });
    const testId = Date.now().toString();
    const request = testDriver.createCreateNewRequest(testId);
    await container.attach(request);
    container.close();

    return testId;
}

async function load(testDriver: ITestDriver, testId: string) {
    const loader = createLoader(testDriver);
    const url =  await testDriver.createContainerUrl(testId);
    const respond = await loader.request({ url });
    // TODO: Error checking
    return respond.value as ILoadTest;
}

const createTestDriver =
    async (driver: TestDriverTypes) => createFluidTestDriver(driver,{
        odsp: {
            directory: "stress",
        },
    });

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test tenant info to use from testConfig.json", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .option("-id, --testId <testId>", "Load an existing data store rather than creating new")
        .option("-r, --runId <runId>", "run a child process with the given id. Requires --testId option.")
        .option("-d, --debug", "Debug child processes via --inspect-brk")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const profileArg: string = commander.profile;
    const testId: string | undefined = commander.testId;
    const runId: number | undefined = commander.runId === undefined ? undefined : parseInt(commander.runId, 10);
    const debug: true | undefined = commander.debug;
    const log: string | undefined = commander.log;

    let config: ITestConfig;
    try {
        config = JSON.parse(fs.readFileSync("./testConfig.json", "utf-8"));
    } catch (e) {
        console.error("Failed to read testConfig.json");
        console.error(e);
        process.exit(-1);
    }

    const profile: ILoadTestConfig | undefined = config.profiles[profileArg];
    if (profile === undefined) {
        console.error("Invalid --profile argument not found in testConfig.json profiles");
        process.exit(-1);
    }

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    let result: number;
    // When runId is specified (with testId), kick off a single test runner and exit when it's finished
    if (runId !== undefined) {
        if (testId === undefined) {
            console.error("Missing --testId argument needed to run child process");
            process.exit(-1);
        }
        result = await runnerProcess(driver, profile, runId, testId);
        process.exit(result);
    }

    // When runId is not specified, this is the orchestrator process which will spawn child test runners.
    result = await orchestratorProcess(
        driver,
        { ...profile, name: profileArg },
        { testId, debug });
    process.exit(result);
}

/**
 * Implementation of the runner process. Returns the return code to exit the process with.
 */
async function runnerProcess(
    driver: TestDriverTypes,
    profile: ILoadTestConfig,
    runId: number,
    testId: string,
): Promise<number> {
    try {
        const runConfig: IRunConfig = {
            runId,
            testConfig: profile,
        };

        const testDriver = await createTestDriver(driver);

        const stressTest = await load(testDriver, testId);
        await stressTest.run(runConfig);
        console.log(`${runId.toString().padStart(3)}> exit`);
        return 0;
    } catch (e) {
        console.error(`${runId.toString().padStart(3)}> error: loading test`);
        console.error(e);
        return -1;
    }
}

/**
 * Implementation of the orchestrator process. Returns the return code to exit the process with.
 */
async function orchestratorProcess(
    driver: TestDriverTypes,
    profile: ILoadTestConfig & { name: string },
    args: { testId?: string, debug?: true },
): Promise<number> {
    const testDriver = await createTestDriver(driver);

    // Create a new file if a testId wasn't provided
    const testId = args.testId ?? await initialize(testDriver);

    const estRunningTimeMin = Math.floor(2 * profile.totalSendCount / (profile.opRatePerMin * profile.numClients));
    console.log(`Connecting to ${args.testId ? "existing" : "new"} Container targeting with testId:\n${testId }`);
    console.log(`Selected test profile: ${profile.name}`);
    console.log(`Estimated run time: ${estRunningTimeMin} minutes\n`);

    const p: Promise<void>[] = [];
    for (let i = 0; i < profile.numClients; i++) {
        const childArgs: string[] = [
            "./dist/nodeStressTest.js",
            "--driver", driver,
            "--profile", profile.name,
            "--runId", i.toString(),
            "--testId", testId];
        if (args.debug) {
            const debugPort = 9230 + i; // 9229 is the default and will be used for the root orchestrator process
            childArgs.unshift(`--inspect-brk=${debugPort}`);
        }
        const process = child_process.spawn(
            "node",
            childArgs,
            { stdio: "inherit" },
        );
        p.push(new Promise((resolve) => process.on("close", resolve)));
    }
    await Promise.all(p);
    return 0;
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
