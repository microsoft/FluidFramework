/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import random from "random-js";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { ILoadTest, IRunConfig } from "./loadTestDataStore";
import { createCodeLoader, createTestDriver, getProfile, loggerP, safeExit } from "./utils";
import { FaultInjectionDocumentServiceFactory } from "./faultInjectionDriver";
import { generateLoaderOptions, generateRuntimeOptions } from "./optionsMatrix";

import { setAppInsightsTelemetry } from "./appinsightslogger";

function printStatus(runConfig: IRunConfig, message: string) {
    if(runConfig.verbose) {
        console.log(`${runConfig.runId.toString().padStart(3)}> ${message}`);
    }
}

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .requiredOption("-u --url <url>", "Load an existing data store from the url")
        .requiredOption("-r, --runId <runId>", "run a child process with the given id. Requires --url option.")
        .requiredOption("-s, --seed <number>", "Seed for this runners random number generator")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .option("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const profileArg: string = commander.profile;
    const url: string = commander.url;
    const runId: number  = commander.runId;
    const log: string | undefined = commander.log;
    const verbose: boolean = commander.verbose ?? false;
    const seed: number = commander.seed;

    const profile = getProfile(profileArg);

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    if (url === undefined) {
        console.error("Missing --url argument needed to run child process");
        process.exit(-1);
    }

    const randEng = random.engines.mt19937();
    // combine the runId with the seed for generating local randoms
    // this makes runners repeatable, but ensures each runner
    // will get its own set of randoms
    randEng.seedWithArray([seed, runId]);

    const l = await loggerP;
    process.on("unhandledRejection", (reason, promise) => {
        try{
            l.sendErrorEvent({eventName: "UnhandledPromiseRejection"}, reason);
        } catch(e) {
            console.error("Error during logging unhandled promise rejection: ", e);
        }
    });
    const result = await runnerProcess(
        driver,
        {
            runId,
            testConfig: profile,
            verbose,
            randEng,
        },
        url,
        seed);

    await safeExit(result, url, runId);
}

function *factoryPermutations<T extends IDocumentServiceFactory>(create: () => T) {
    let counter = 0;
    const factoryReused = create();

    while (true) {
        counter++;
        // Switch between creating new factory vs. reusing factory.
        // Certain behavior (like driver caches) are per factory instance, and by reusing it we hit those code paths
        // At the same time we want to test newly created factory.
        let documentServiceFactory: T = factoryReused;
        let headers: IRequestHeader = {};
        switch (counter % 5) {
            default:
            case 0:
                documentServiceFactory = create();
                break;
            case 1:
                headers = { [LoaderHeader.loadMode]: { opsBeforeReturn : "cached"} };
                break;
            case 2:
                headers = { [LoaderHeader.loadMode]: { opsBeforeReturn : "all"} };
                break;
            case 3:
                headers = { [LoaderHeader.loadMode]: { deltaConnection : "none"} };
                break;
            case 4:
                headers = { [LoaderHeader.loadMode]: { deltaConnection : "delayed"} };
                break;
        }
        yield { documentServiceFactory, headers };
    }
}

/**
 * Implementation of the runner process. Returns the return code to exit the process with.
 */
async function runnerProcess(
    driver: TestDriverTypes,
    runConfig: IRunConfig,
    url: string,
    seed: number,
): Promise<number> {
    let telementryCleanup: () => void;

    try {
        const loaderOptions = generateLoaderOptions(seed);
        const containerOptions = generateRuntimeOptions(seed);

        const testDriver = await createTestDriver(driver, seed, runConfig.runId);
        const baseLogger = await loggerP;
        const logger = ChildLogger.create(
            baseLogger, undefined, {all: { runId: runConfig.runId, driverType: testDriver.type }});

        // Cycle between creating new factory vs. reusing factory.
        // Certain behavior (like driver caches) are per factory instance, and by reusing it we hit those code paths
        // At the same time we want to test newly created factory.
        const iterator = factoryPermutations(
            () => new FaultInjectionDocumentServiceFactory(testDriver.createDocumentServiceFactory()));

        let done = false;
        // Reset the workload once, on the first iteration
        let reset = true;
        while (!done) {
            const nextFactoryPermutation = iterator.next();
            if (nextFactoryPermutation.done === true) {
                throw new Error("Factory permutation iterator is expected to cycle forever");
            }
            const { documentServiceFactory, headers } = nextFactoryPermutation.value;

            // Construct the loader
            const loader = new Loader({
                urlResolver: testDriver.createUrlResolver(),
                documentServiceFactory,
                codeLoader: createCodeLoader(containerOptions[runConfig.runId % containerOptions.length]),
                logger,
                options: loaderOptions[runConfig.runId % containerOptions.length],
            });

            logger.sendTelemetryEvent({eventName: "LoadingContainer"});
            const container = await loader.resolve({ url, headers });
            container.resume();
            const test = await requestFluidObject<ILoadTest>(container,"/");

            telementryCleanup = await setAppInsightsTelemetry(container, runConfig, url);

            if (runConfig.testConfig.noFaultInjection === undefined
                    || runConfig.testConfig.noFaultInjection === false) {
                scheduleContainerClose(container, runConfig);
                scheduleFaultInjection(documentServiceFactory, container, runConfig);
            }
            try {
                printStatus(runConfig, `running`);
                done = await test.run(runConfig, reset);
                reset = false;
                printStatus(runConfig, done ? `finished` : "closed");
            } catch (error) {
                logger.sendErrorEvent({eventName: "RunnerFailed"}, error);
            } finally {
                if (!container.closed) {
                    container.close();
                }
                telementryCleanup();
                await baseLogger.flush({url, runId: runConfig.runId});
            }
        }
        return 0;
    } catch (e) {
        printStatus(runConfig, `error: loading test`);
        console.error(e);
        return -1;
    }
}

function scheduleFaultInjection(
    ds: FaultInjectionDocumentServiceFactory,
    container: Container,
    runConfig: IRunConfig) {
    const schedule = ()=>{
        const injectionTime = runConfig.testConfig.readWriteCycleMs * random.real(0, 5)(runConfig.randEng);
        printStatus(runConfig, `fault injection in ${(injectionTime / 60000).toString().substring(0,4)} min`);
        setTimeout(() => {
            if(container.connected && container.resolvedUrl !== undefined) {
                const deltaConn =
                    ds.documentServices.get(container.resolvedUrl)?.documentDeltaConnection;
                if(deltaConn !== undefined) {
                    // 1 in numClients chance of non-retritable error to not overly conflict with container close
                    const canRetry =
                        random.integer(0,  runConfig.testConfig.numClients - 1)(runConfig.randEng) === 0 ? false : true;
                    switch(random.integer(0,  5)(runConfig.randEng)) {
                        // dispreferr errors
                        case 0: {
                            deltaConn.injectError(canRetry);
                            printStatus(runConfig, `error injected canRetry:${canRetry}`);
                            break;
                        }
                        case 1:
                        case 2: {
                            deltaConn.injectDisconnect();
                            printStatus(runConfig, "disconnect injected");
                            break;
                        }
                        case 3:
                        case 4:
                        default: {
                            deltaConn.injectNack(container.id, canRetry);
                            printStatus(runConfig, `nack injected canRetry:${canRetry}`);
                            break;
                        }
                    }
                }
            }
            if(!container.closed) {
                schedule();
            }
        }, injectionTime);
    };
    schedule();
}

function scheduleContainerClose(container: Container, runConfig: IRunConfig) {
    new Promise<void>((res)=>{
        // wait for the container to connect write
        container.once("closed", res);
        if(!container.deltaManager.active) {
            container.once("connected", ()=>{
                res();
                container.off("closed", res);
            });
        }
    }).then(()=>{
        if(container.closed) {
            return;
        }
        const quorum = container.getQuorum();
        const scheduleLeave = ()=>{
            const clientId = container.clientId;
            if(clientId !== undefined && quorum.getMembers().has(clientId)) {
                // calculate the clients quorum position
                const quorumIndex = [... quorum.getMembers().entries()]
                    .sort((a,b)=>b[1].sequenceNumber - a[1].sequenceNumber)
                    .map((m)=>m[0])
                    .indexOf(clientId);

                // only the oldest quarter of active clients are scheduled to leave this time.
                // this will bias toward the summarizer client which is always quorum index 0.
                if(quorumIndex >= 0 && quorumIndex <= runConfig.testConfig.numClients / 4) {
                    quorum.off("removeMember",scheduleLeave);
                    const leaveTime = runConfig.testConfig.readWriteCycleMs * random.real(0,  5)(runConfig.randEng);
                    printStatus(runConfig, `closing in ${(leaveTime / 60000).toString().substring(0,4)} min`);
                    setTimeout(
                        ()=>{
                            if(!container.closed) {
                                container.close();
                            }
                        },
                        leaveTime);
                }
            }
        };
        quorum.on("removeMember", scheduleLeave);
        scheduleLeave();
    }).catch(async (e)=>{
        await loggerP.then(async (l)=>l.sendErrorEvent({eventName: "ScheduleLeaveFailed", runId: runConfig.runId}, e));
    });
}

main()
.catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
