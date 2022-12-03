/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";
import {
    ITestDriver,
    TestDriverTypes,
    DriverEndpoint,
} from "@fluidframework/test-driver-definitions";
import { Loader, ConnectionState } from "@fluidframework/container-loader";
import random from "random-js";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IDocumentServiceFactory, IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { assert } from "@fluidframework/common-utils";
import { ITelemetryBaseEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { ILoadTest, IRunConfig } from "./loadTestDataStore";
import { createCodeLoader, createTestDriver, getProfile, loggerP, safeExit } from "./utils";
import { FaultInjectionDocumentServiceFactory } from "./faultInjectionDriver";
import { generateConfigurations, generateLoaderOptions, generateRuntimeOptions } from "./optionsMatrix";

function printStatus(runConfig: IRunConfig, message: string) {
    if (runConfig.verbose) {
        console.log(`${runConfig.runId.toString().padStart(3)}> ${message}`);
    }
}

async function main() {
    const parseIntArg = (value: any): number => {
        if (isNaN(parseInt(value, 10))) {
            throw new commander.InvalidArgumentError("Not a number.");
        }
        return parseInt(value, 10);
    };
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .requiredOption("-u --url <url>", "Load an existing data store from the url")
        .requiredOption("-r, --runId <runId>",
            "run a child process with the given id. Requires --url option.", parseIntArg)
        .requiredOption("-s, --seed <number>", "Seed for this runners random number generator")
        .option("-e, --driverEndpoint <endpoint>", "Which endpoint should the driver target?")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .option("-v, --verbose", "Enables verbose logging")
        .option("-m, --enableOpsMetrics", "Enable capturing ops metrics")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const endpoint: DriverEndpoint | undefined = commander.driverEndpoint;
    const profileArg: string = commander.profile;
    const url: string = commander.url;
    const runId: number = commander.runId;
    const log: string | undefined = commander.log;
    const verbose: boolean = commander.verbose ?? false;
    const seed: number = commander.seed;
    const enableOpsMetrics: boolean = commander.enableOpsMetrics ?? false;

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

    const result = await runnerProcess(
        driver,
        endpoint,
        {
            runId,
            testConfig: profile,
            verbose,
            randEng,
        },
        url,
        seed,
        enableOpsMetrics);

    await safeExit(result, url, runId);
}

function* factoryPermutations<T extends IDocumentServiceFactory>(create: () => T) {
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
                headers = { [LoaderHeader.loadMode]: { opsBeforeReturn: "cached" } };
                break;
            case 2:
                headers = { [LoaderHeader.loadMode]: { opsBeforeReturn: "all" } };
                break;
            case 3:
                headers = { [LoaderHeader.loadMode]: { deltaConnection: "none" } };
                break;
            case 4:
                headers = { [LoaderHeader.loadMode]: { deltaConnection: "delayed" } };
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
    endpoint: DriverEndpoint | undefined,
    runConfig: IRunConfig,
    url: string,
    seed: number,
    enableOpsMetrics: boolean,
): Promise<number> {
    // Assigning no-op value due to linter.
    let metricsCleanup: () => void = () => {};
    let testFailed: boolean = false;

    try {
        const optionsOverride = `${driver}${endpoint !== undefined ? `-${endpoint}` : ""}`;
        const loaderOptions = generateLoaderOptions(
            seed, runConfig.testConfig?.optionOverrides?.[optionsOverride]?.loader);

        const containerOptions = generateRuntimeOptions(
            seed, runConfig.testConfig?.optionOverrides?.[optionsOverride]?.container);

        const configurations = generateConfigurations(
            seed, runConfig.testConfig?.optionOverrides?.[optionsOverride]?.configurations);
        const testDriver: ITestDriver = await createTestDriver(driver, endpoint, seed, runConfig.runId);
        const baseLogger = await loggerP;
        const logger = ChildLogger.create(baseLogger, undefined,
            {
                all: {
                    runId: runConfig.runId,
                    driverType: testDriver.type,
                    driverEndpointName: testDriver.endpointName,
                    userIndex: testDriver.userIndex,
                },
            });

        // Check for InactiveObject or SweepReadyObject logs
        baseLogger.observer.on("logEvent", (logEvent: ITelemetryBaseEvent) => {
            if (logEvent.eventName.includes("InactiveObject") || logEvent.eventName.includes("SweepReadyObject")) {
                testFailed = true;
                console.error(`xxxxxxxxx ${JSON.stringify(logEvent)}`);
            }
        });

        process.on("unhandledRejection", (reason, promise) => {
            try {
                logger.sendErrorEvent({ eventName: "UnhandledPromiseRejection" }, reason);
            } catch (e) {
                console.error("Error during logging unhandled promise rejection: ", e);
            }
        });

        // Cycle between creating new factory vs. reusing factory.
        // Certain behavior (like driver caches) are per factory instance, and by reusing it we hit those code paths
        // At the same time we want to test newly created factory.
        const iterator = factoryPermutations(
            () => new FaultInjectionDocumentServiceFactory(testDriver.createDocumentServiceFactory()));

        let done = false;
        // Reset the workload once, on the first iteration
        let reset = true;
        while (!done) {
            let container: IContainer | undefined;
            try {
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
                    configProvider: {
                        getRawConfig(name) {
                            return configurations[runConfig.runId % configurations.length][name];
                        },
                    },
                });

                container = await loader.resolve({ url, headers });
                container.connect();
                const test = await requestFluidObject<ILoadTest>(container, "/");

                if (enableOpsMetrics) {
                    const testRuntime = await test.getRuntime();
                    metricsCleanup = await setupOpsMetrics(container, logger, runConfig.testConfig.progressIntervalMs,
                                                        testRuntime);
                }

                // Control fault injection period through config.
                // If undefined then no fault injection.
                const faultInjection = runConfig.testConfig.faultInjectionMs;
                if (faultInjection) {
                    scheduleContainerClose(container, runConfig, faultInjection.min, faultInjection.max);
                    scheduleFaultInjection(
                        documentServiceFactory,
                        container,
                        runConfig,
                        faultInjection.min,
                        faultInjection.max);
                }
                const offline = runConfig.testConfig.offline;
                if (offline) {
                    scheduleOffline(
                        documentServiceFactory,
                        container,
                        runConfig,
                        offline.delayMs.min,
                        offline.delayMs.max,
                        offline.durationMs.min,
                        offline.durationMs.max,
                    );
                }

                printStatus(runConfig, `running`);
                done = await test.run(runConfig, reset, logger);
                reset = false;
                printStatus(runConfig, done ? `finished` : "closed");
            } catch (error) {
                logger.sendErrorEvent({
                    eventName: "RunnerFailed",
                    testHarnessEvent: true,
                }, error);
            } finally {
                if (container?.closed === false) {
                    container?.close();
                }
                metricsCleanup();
                await baseLogger.flush({ url, runId: runConfig.runId });
            }
        }
        return testFailed ? -1 : 0;
    } catch (e) {
        printStatus(runConfig, `error: loading test`);
        console.error(e);
        return -1;
    }
}

function scheduleFaultInjection(
    ds: FaultInjectionDocumentServiceFactory,
    container: IContainer,
    runConfig: IRunConfig,
    faultInjectionMinMs: number,
    faultInjectionMaxMs: number) {
    const schedule = () => {
        const injectionTime = random.integer(faultInjectionMinMs, faultInjectionMaxMs)(runConfig.randEng);
        printStatus(runConfig, `fault injection in ${(injectionTime / 60000).toString().substring(0, 4)} min`);
        setTimeout(() => {
            if (container.connectionState === ConnectionState.Connected && container.resolvedUrl !== undefined) {
                const deltaConn =
                    ds.documentServices.get(container.resolvedUrl)?.documentDeltaConnection;
                if (deltaConn !== undefined) {
                    // 1 in numClients chance of non-retritable error to not overly conflict with container close
                    const canRetry =
                        random.integer(0, runConfig.testConfig.numClients - 1)(runConfig.randEng) === 0 ? false : true;
                    switch (random.integer(0, 5)(runConfig.randEng)) {
                        // dispreferr errors
                        case 0: {
                            printStatus(runConfig, `error injected canRetry:${canRetry}`);
                            deltaConn.injectError(canRetry);
                            break;
                        }
                        case 1:
                        case 2: {
                            printStatus(runConfig, "disconnect injected");
                            deltaConn.injectDisconnect();
                            break;
                        }
                        case 3:
                        case 4:
                        default: {
                            printStatus(runConfig, `nack injected canRetry:${canRetry}`);
                            deltaConn.injectNack((container.resolvedUrl as IFluidResolvedUrl).id, canRetry);
                            break;
                        }
                    }
                }
            }
            if (!container.closed) {
                schedule();
            }
        }, injectionTime);
    };
    schedule();
}

function scheduleContainerClose(
    container: IContainer,
    runConfig: IRunConfig,
    faultInjectionMinMs: number,
    faultInjectionMaxMs: number) {
    new Promise<void>((resolve) => {
        // wait for the container to connect write
        container.once("closed", () => resolve);
        if (container.connectionState !== ConnectionState.Connected && !container.closed) {
            container.once("connected", () => {
                resolve();
                container.off("closed", () => resolve);
            });
        }
    }).then(() => {
        if (container.closed) {
            return;
        }
        const quorum = container.getQuorum();
        const scheduleLeave = () => {
            const clientId = container.clientId;
            if (clientId !== undefined && quorum.getMembers().has(clientId)) {
                // calculate the clients quorum position
                const quorumIndex = [...quorum.getMembers().entries()]
                    .sort((a, b) => b[1].sequenceNumber - a[1].sequenceNumber)
                    .map((m) => m[0])
                    .indexOf(clientId);

                // only the oldest quarter of active clients are scheduled to leave this time.
                // this will bias toward the summarizer client which is always quorum index 0.
                if (quorumIndex >= 0 && quorumIndex <= runConfig.testConfig.numClients / 4) {
                    quorum.off("removeMember", scheduleLeave);
                    const leaveTime = random.integer(faultInjectionMinMs, faultInjectionMaxMs)(runConfig.randEng);
                    printStatus(runConfig, `closing in ${(leaveTime / 60000).toString().substring(0, 4)} min`);
                    setTimeout(
                        () => {
                            if (!container.closed) {
                                container.close();
                            }
                        },
                        leaveTime);
                }
            }
        };
        quorum.on("removeMember", scheduleLeave);
        scheduleLeave();
    }).catch(async (e) => {
        await loggerP.then(async (l) => l.sendErrorEvent({
            eventName: "ScheduleLeaveFailed", runId: runConfig.runId,
        }, e));
    });
}

function scheduleOffline(
    dsf: FaultInjectionDocumentServiceFactory,
    container: IContainer,
    runConfig: IRunConfig,
    offlineDelayMinMs: number,
    offlineDelayMaxMs: number,
    offlineDurationMinMs: number,
    offlineDurationMaxMs: number,
) {
    new Promise<void>((resolve) => {
        if (container.connectionState !== ConnectionState.Connected && !container.closed) {
            container.once("connected", () => resolve());
            container.once("closed", () => resolve());
        } else {
            resolve();
        }
    }).then(async () => {
        const schedule = async (): Promise<void> => {
            if (container.closed) {
                return;
            }

            const injectionTime = random.integer(offlineDelayMinMs, offlineDelayMaxMs)(runConfig.randEng);
            await new Promise<void>((resolve) => setTimeout(resolve, injectionTime));

            assert(container.resolvedUrl !== undefined, "no url");
            const ds = dsf.documentServices.get(container.resolvedUrl);
            assert(!!ds, "no documentServices");
            const offlineTime = random.integer(offlineDurationMinMs, offlineDurationMaxMs)(runConfig.randEng);
            printStatus(runConfig, `going offline for ${offlineTime / 1000} seconds!`);
            ds.goOffline();

            await new Promise<void>((resolve) => setTimeout(resolve, offlineTime));
            if (!container.closed) {
                ds.goOnline();
                printStatus(runConfig, "going online!");
                return schedule();
            }
        };
        return schedule();
    }).catch(async (e) => {
        await loggerP.then(async (l) => l.sendErrorEvent({
            eventName: "ScheduleOfflineFailed", runId: runConfig.runId,
        }, e));
    });
}

async function setupOpsMetrics(container: IContainer, logger: ITelemetryLogger, progressIntervalMs: number,
    testRuntime: IFluidDataStoreRuntime) {
    // Use map to cache userName instead of recomputing.
    const clientIdUserNameMap: { [clientId: string]: string; } = {};

    const getUserName = (userContainer: IContainer) => {
        const clientId = userContainer.clientId;
        if (clientId !== undefined && clientId.length > 0) {
            if (clientIdUserNameMap[clientId]) {
                return clientIdUserNameMap[clientId];
            }

            const userName: string | undefined = userContainer.getQuorum().getMember(clientId)?.client.user.id;
            if (userName !== undefined && userName.length > 0) {
                clientIdUserNameMap[clientId] = userName;
                return userName;
            }
        } else {
            return "Unknown";
        }
    };

    let submittedOpsSize = 0;
    let submittedOps = 0;
    container.deltaManager.on("submitOp", (message) => {
        if (message?.type === "op") {
            submittedOps++;
            const currOpSize = (JSON.stringify(message)).length;
            submittedOpsSize += currOpSize;
        }
    });

    let receivedOpsSize = 0;
    let receivedOps = 0;
    container.deltaManager.on("op", (message) => {
        if (message?.type === "op") {
            receivedOps++;
            const currOpSize = (JSON.stringify(message)).length;
            receivedOpsSize += currOpSize;
        }
    });

    let submittedSignals = 0;
    let receivedSignals = 0;
    testRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
        if (message.type === "generic-signal" && local === true) {
            submittedSignals += 1;
        } else if (message.type === "generic-signal" && local === false) {
            receivedSignals += 1;
        }
    });

    let t: NodeJS.Timeout | undefined;
    const sendMetrics = () => {
        if (submittedOps > 0) {
            logger.send({
                category: "metric",
                eventName: "Fluid Operations Sent",
                testHarnessEvent: true,
                value: submittedOps,
                clientId: container.clientId,
                userName: getUserName(container),
            });
        }
        if (receivedOps > 0) {
            logger.send({
                category: "metric",
                eventName: "Fluid Operations Received",
                testHarnessEvent: true,
                value: receivedOps,
                clientId: container.clientId,
                userName: getUserName(container),
            });
        }

        if (submittedSignals > 0) {
            logger.send({
                category: "metric",
                eventName: "Fluid Signals Submitted",
                testHarnessEvent: true,
                value: submittedSignals,
                clientId: container.clientId,
                userName: getUserName(container),
            });
        }
        if (receivedSignals > 0) {
            logger.send({
                category: "metric",
                eventName: "Fluid Signals Received",
                testHarnessEvent: true,
                value: receivedSignals,
                clientId: container.clientId,
                userName: getUserName(container),
            });
        }
        if (submittedOps > 0) {
            logger.send({
                category: "metric",
                eventName: "Size of Fluid Operations Sent",
                testHarnessEvent: true,
                value: submittedOpsSize,
                clientId: container.clientId,
                userName: getUserName(container),
            });
        }
        if (receivedOps > 0) {
            logger.send({
                category: "metric",
                eventName: "Size of Fluid Operations Received",
                testHarnessEvent: true,
                value: receivedOpsSize,
                clientId: container.clientId,
                userName: getUserName(container),
            });
        }

        submittedOps = 0;
        receivedOps = 0;
        submittedSignals = 0;
        receivedSignals = 0;
        submittedOpsSize = 0;
        receivedOpsSize = 0;

        t = setTimeout(sendMetrics, progressIntervalMs);
    };

    sendMetrics();

    return (): void => {
        sendMetrics();
        if (t) {
            clearTimeout(t);
        }
    };
}

main()
    .catch(
        (error) => {
            console.error(error);
            process.exit(-1);
        },
    );
