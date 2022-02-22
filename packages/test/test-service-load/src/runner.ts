/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";
import { ITestDriver, TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { Loader } from "@fluidframework/container-loader";
import random from "random-js";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IDocumentServiceFactory, IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { assert } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ILoadTest, IRunConfig } from "./loadTestDataStore";
import { createCodeLoader, createTestDriver, getProfile, loggerP, safeExit } from "./utils";
import { FaultInjectionDocumentServiceFactory } from "./faultInjectionDriver";
import { generateLoaderOptions, generateRuntimeOptions } from "./optionsMatrix";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

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
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .option("-v, --verbose", "Enables verbose logging")
        .option("-m, --enableOpsMetrics", "Enable capturing ops metrics")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
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

    const l = await loggerP;
    process.on("unhandledRejection", (reason, promise) => {
        try {
            l.sendErrorEvent({ eventName: "UnhandledPromiseRejection" }, reason);
        } catch (e) {
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
    runConfig: IRunConfig,
    url: string,
    seed: number,
    enableOpsMetrics: boolean,
): Promise<number> {
    // Assigning no-op value due to linter.
    let metricsCleanup: () => void = () => {};

    try {
        const loaderOptions = generateLoaderOptions(
            seed, runConfig.testConfig?.optionOverrides?.[driver]?.loader);

        const containerOptions = generateRuntimeOptions(
            seed, runConfig.testConfig?.optionOverrides?.[driver]?.container);

        const testDriver: ITestDriver = await createTestDriver(driver, seed, runConfig.runId);
        const baseLogger = await loggerP;
        const logger = ChildLogger.create(baseLogger, undefined,
            {
                all: {
                    runId: runConfig.runId,
                    driverType: testDriver.type,
                    driverEndpointName: testDriver.endpointName,
                },
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

            const container: IContainer = await loader.resolve({ url, headers });
            // TODO: Remove null check after next release #8523
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            container.resume!();
            const test = await requestFluidObject<ILoadTest>(container, "/");

            if (enableOpsMetrics) {
                const testRuntime = await test.getRuntime();
                metricsCleanup = await setupOpsMetrics(container, logger, runConfig.testConfig.progressIntervalMs,
                                                       testRuntime);
            }

            // Control fault injection period through config.
            // If undefined then no fault injection.
            const faultInjectionMinMs = runConfig.testConfig.faultInjectionMinMs;
            const faultInjectionMaxMs = runConfig.testConfig.faultInjectionMaxMs;
            if (faultInjectionMaxMs !== undefined) {
                assert(faultInjectionMinMs !== undefined, "Define faultInjectionMinMs.");
                assert(faultInjectionMinMs >= 0, "faultInjectionMinMs must be greater than or equal to zero.");
                assert(faultInjectionMaxMs > 0, "faultInjectionMaxMs must be greater than zero.");
                assert(faultInjectionMaxMs >= faultInjectionMinMs,
                    "faultInjectionMaxMs must be greater than or equal to faultInjectionMinMs.");

                scheduleContainerClose(container, runConfig, faultInjectionMinMs, faultInjectionMaxMs);
                scheduleFaultInjection(
                    documentServiceFactory, container, runConfig, faultInjectionMinMs, faultInjectionMaxMs);
            } else {
                assert(faultInjectionMinMs === undefined, "Define faultInjectionMaxMs.");
            }

            try {
                printStatus(runConfig, `running`);
                done = await test.run(runConfig, reset);
                reset = false;
                printStatus(runConfig, done ? `finished` : "closed");
            } catch (error) {
                logger.sendErrorEvent({
                    eventName: "RunnerFailed",
                    testHarnessEvent: true,
                }, error);
            } finally {
                if (!container.closed) {
                    container.close();
                }
                metricsCleanup();
                await baseLogger.flush({ url, runId: runConfig.runId });
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
    container: IContainer,
    runConfig: IRunConfig,
    faultInjectionMinMs: number,
    faultInjectionMaxMs: number) {
    const schedule = () => {
        const injectionTime = random.integer(faultInjectionMinMs, faultInjectionMaxMs)(runConfig.randEng);
        printStatus(runConfig, `fault injection in ${(injectionTime / 60000).toString().substring(0, 4)} min`);
        setTimeout(() => {
            // TODO: Remove null check after next release #8523
            if (container.connected !== undefined && container.connected && container.resolvedUrl !== undefined) {
                const deltaConn =
                    ds.documentServices.get(container.resolvedUrl)?.documentDeltaConnection;
                if (deltaConn !== undefined) {
                    // 1 in numClients chance of non-retritable error to not overly conflict with container close
                    const canRetry =
                        random.integer(0, runConfig.testConfig.numClients - 1)(runConfig.randEng) === 0 ? false : true;
                    switch (random.integer(0, 5)(runConfig.randEng)) {
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
                            deltaConn.injectNack((container.resolvedUrl as IFluidResolvedUrl).id, canRetry);
                            printStatus(runConfig, `nack injected canRetry:${canRetry}`);
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
        // TODO: Remove null check after next release #8523
        if (container.connected !== undefined && !container.connected && !container.closed) {
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

async function setupOpsMetrics(container: IContainer, logger: ITelemetryLogger, progressIntervalMs: number,
                               testRuntime: IFluidDataStoreRuntime) {
    // Use map to cache userName instead of recomputing.
    const clientIdUserNameMap: { [clientId: string]: string } = {};

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

    let submitedOps = 0;
    container.deltaManager.on("submitOp", (message) => {
        if (message?.type === "op") {
            submitedOps++;
        }
    });

    let receivedOps = 0;
    container.deltaManager.on("op", (message) => {
        if (message?.type === "op") {
            receivedOps++;
        }
    });

    let submittedSignals = 0;
    testRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
        if (message.type === "generic-signal" && local === true) {
            submittedSignals += 1;
        }
    });

    let receivedSignals = 0;
    testRuntime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
        if (message.type === "generic-signal" && local === false) {
            receivedSignals += 1;
        }
    });

    let t: NodeJS.Timeout | undefined;
    const sendMetrics = () => {
        if (submitedOps > 0) {
            logger.send({
                category: "metric",
                eventName: "Fluid Operations Sent",
                testHarnessEvent: true,
                value: submitedOps,
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


        submitedOps = 0;
        receivedOps = 0;
        submittedSignals = 0;
        receivedSignals = 0;

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
