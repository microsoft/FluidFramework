/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DriverEndpoint,
	ITestDriver,
	TestDriverTypes,
} from "@fluid-internal/test-driver-definitions";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	IContainerExperimental,
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { IRequestHeader, type ConfigTypes } from "@fluidframework/core-interfaces";
import { assert, delay } from "@fluidframework/core-utils/internal";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import { getRetryDelayFromError } from "@fluidframework/driver-utils/internal";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";
import { GenericError, ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import commander from "commander";

import { createLogger } from "./FileLogger.js";
import {
	FaultInjectionDocumentServiceFactory,
	FaultInjectionError,
} from "./faultInjectionDriver.js";
import { getProfile } from "./getProfile.js";
import { ILoadTest, IRunConfig } from "./loadTestDataStore.js";
import {
	generateConfigurations,
	generateLoaderOptions,
	generateRuntimeOptions,
	getOptionOverride,
} from "./optionsMatrix.js";
import {
	configProvider,
	createCodeLoader,
	createTestDriver,
	globalConfigurations,
	printStatus,
} from "./utils.js";

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
		.requiredOption(
			"-p, --profile <profile>",
			"Which test profile to use from testConfig.json",
			"ci",
		)
		.requiredOption("-u --url <url>", "Load an existing data store from the url")
		.requiredOption(
			"-r, --runId <runId>",
			"run a child process with the given id. Requires --url option.",
			parseIntArg,
		)
		.requiredOption("-s, --seed <number>", "Seed for this runners random number generator")
		.requiredOption("-o, --outputDir <path>", "Path for log output files")
		.option("-e, --driverEndpoint <endpoint>", "Which endpoint should the driver target?")
		.option(
			"-l, --log <filter>",
			"Filter debug logging. If not provided, uses DEBUG env variable.",
		)
		.option("-v, --verbose", "Enables verbose logging")
		.option("-m, --enableOpsMetrics", "Enable capturing ops metrics")
		.parse(process.argv);

	const driver: TestDriverTypes = commander.driver;
	const endpoint: DriverEndpoint | undefined = commander.driverEndpoint;
	const profileName: string = commander.profile;
	const url: string = commander.url;
	const runId: number = commander.runId;
	const log: string | undefined = commander.log;
	const verbose: boolean = commander.verbose ?? false;
	const seed: number = commander.seed;
	const outputDir: string = commander.outputDir;
	const enableOpsMetrics: boolean = commander.enableOpsMetrics ?? false;

	if (log !== undefined) {
		process.env.DEBUG = log;
	}

	const { logger, flush } = await createLogger(outputDir, runId.toString(), {
		runId,
		driverType: driver,
		driverEndpointName: endpoint,
		profile: profileName,
	});

	// this will enabling capturing the full stack for errors
	// since this is test capturing the full stack is worth it
	// in non-test environment we need to be more cautious
	// as this will incur a perf impact when errors are
	// thrown and will take more storage in any logging sink
	// https://v8.dev/docs/stack-trace-api
	Error.stackTraceLimit = Infinity;

	process.on("uncaughtExceptionMonitor", (error, origin) => {
		try {
			logger.sendErrorEvent({ eventName: "uncaughtExceptionMonitor", origin }, error);
		} catch (e) {
			console.error("Error during logging unhandled exception: ", e);
		}
	});

	let result = -1;
	try {
		const profile = getProfile(profileName);

		if (url === undefined) {
			console.error("Missing --url argument needed to run child process");
			throw new Error("Missing --url argument needed to run child process");
		}

		// combine the runId with the seed for generating local randoms
		// this makes runners repeatable, but ensures each runner
		// will get its own set of randoms
		const random = makeRandom(seed, runId);

		await runnerProcess(
			driver,
			endpoint,
			{
				runId,
				testConfig: profile,
				verbose,
				random,
				profileName,
				logger,
			},
			url,
			seed,
			enableOpsMetrics,
		);
		result = 0;
	} catch (e) {
		logger.sendErrorEvent({ eventName: "runnerFailed" }, e);
	} finally {
		// There seems to be at least one dangling promise in ODSP Driver, give it a second to resolve
		// TODO: Track down the dangling promise and fix it.
		await new Promise((resolve) => {
			setTimeout(resolve, 1000);
		});
		// Flush the logs
		await flush();

		process.exit(result);
	}
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
): Promise<void> {
	// Assigning no-op value due to linter.
	let metricsCleanup: () => void = () => {};

	const optionsOverride = getOptionOverride(runConfig.testConfig, driver, endpoint);

	const loaderOptions = generateLoaderOptions(seed, optionsOverride?.loader);
	const containerOptions = generateRuntimeOptions(seed, optionsOverride?.container);
	const configurations = generateConfigurations(seed, optionsOverride?.configurations);

	const testDriver: ITestDriver = await createTestDriver(
		driver,
		endpoint,
		seed,
		runConfig.runId,
		false, // supportsBrowserAuth
	);

	// Cycle between creating new factory vs. reusing factory.
	// Certain behavior (like driver caches) are per factory instance, and by reusing it we hit those code paths
	// At the same time we want to test newly created factory.
	const iterator = factoryPermutations(
		() => new FaultInjectionDocumentServiceFactory(testDriver.createDocumentServiceFactory()),
	);

	let done = false;
	// Reset the workload once, on the first iteration
	let reset = true;
	let stashedOpP: Promise<string | undefined> | undefined;
	while (!done) {
		let container: IContainer | undefined;
		try {
			const nextFactoryPermutation = iterator.next();
			if (nextFactoryPermutation.done === true) {
				throw new Error("Factory permutation iterator is expected to cycle forever");
			}
			const { documentServiceFactory, headers } = nextFactoryPermutation.value;

			// Construct the loader
			runConfig.loaderConfig = loaderOptions[runConfig.runId % loaderOptions.length];
			const testConfiguration = configurations[
				runConfig.runId % configurations.length
			] as Record<string, ConfigTypes>;
			runConfig.logger.sendTelemetryEvent({
				eventName: "RunConfigOptions",
				details: JSON.stringify({
					loaderOptions: runConfig.loaderConfig,
					containerOptions: containerOptions[runConfig.runId % containerOptions.length],
					logLevel: runConfig.logger.minLogLevel,
					configurations: { ...globalConfigurations, ...testConfiguration },
				}),
			});
			const loaderProps: ILoaderProps = {
				urlResolver: testDriver.createUrlResolver(),
				documentServiceFactory,
				codeLoader: createCodeLoader(
					containerOptions[runConfig.runId % containerOptions.length],
				),
				logger: runConfig.logger,
				options: runConfig.loaderConfig,
				configProvider: configProvider(testConfiguration),
			};

			const stashedOps = stashedOpP ? await stashedOpP : undefined;
			stashedOpP = undefined; // delete to avoid reuse

			container = await loadExistingContainer({
				...loaderProps,
				request: { url, headers },
				pendingLocalState: stashedOps,
			});

			container.connect();
			const test = (await container.getEntryPoint()) as ILoadTest;

			// Retain old behavior of runtime being disposed on container close
			container.once("closed", (err) => {
				// everywhere else we gracefully handle container close/dispose,
				// and don't create more errors which add noise to the stress
				// results. This should be the only place we on error close/dispose ,
				// as this place catches closes with no error specified, which
				// should never happen. if it does happen, the container is
				// closing without error which could be a test or product bug,
				// but we don't want silent failures.
				container?.dispose(
					err === undefined
						? new GenericError("Container closed unexpectedly without error")
						: undefined,
				);
			});

			if (enableOpsMetrics) {
				const testRuntime = await test.getRuntime();
				if (testRuntime !== undefined) {
					metricsCleanup = await setupOpsMetrics(
						container,
						runConfig.logger,
						runConfig.testConfig.progressIntervalMs,
						testRuntime,
					);
				}
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
					faultInjection.max,
				);
			}
			const offline = runConfig.testConfig.offline;
			if (offline) {
				stashedOpP = scheduleOffline(
					documentServiceFactory,
					container,
					runConfig,
					offline.delayMs.min,
					offline.delayMs.max,
					offline.durationMs.min,
					offline.durationMs.max,
					offline.stashPercent,
				);
			}

			printStatus(runConfig, `running`);
			done = await test.run(runConfig, reset);
			reset = false;
			printStatus(runConfig, done ? `finished` : "closed");
		} catch (error) {
			// clear stashed op in case of error
			stashedOpP = undefined;
			runConfig.logger.sendErrorEvent(
				{
					eventName: "RunnerFailed",
					testHarnessEvent: true,
				},
				error,
			);
			// Add a little backpressure:
			// if the runner closed with some sort of throttling error, avoid running into a throttling loop
			// by respecting that delay before starting the load process for a new container.
			const delayMs = getRetryDelayFromError(error);
			if (delayMs !== undefined) {
				await delay(delayMs);
			}
		} finally {
			if (container?.disposed === false) {
				// this should be the only place we dispose the container
				// to avoid the closed handler above. This is also
				// the only expected, non-fault, closure.
				container?.dispose();
			}
			metricsCleanup();
		}
	}
}

function scheduleFaultInjection(
	ds: FaultInjectionDocumentServiceFactory,
	container: IContainer,
	runConfig: IRunConfig,
	faultInjectionMinMs: number,
	faultInjectionMaxMs: number,
) {
	const schedule = () => {
		const { random } = runConfig;
		const injectionTime = random.integer(faultInjectionMinMs, faultInjectionMaxMs);
		printStatus(
			runConfig,
			`fault injection in ${(injectionTime / 60000).toString().substring(0, 4)} min`,
		);
		setTimeout(() => {
			if (
				container.connectionState === ConnectionState.Connected &&
				container.resolvedUrl !== undefined
			) {
				const deltaConn = ds.documentServices.get(
					container.resolvedUrl,
				)?.documentDeltaConnection;
				if (deltaConn !== undefined && !deltaConn.disposed) {
					// 1 in numClients chance of non-retritable error to not overly conflict with container close
					const canRetry = random.bool(1 - 1 / runConfig.testConfig.numClients);
					switch (random.integer(0, 5)) {
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
							deltaConn.injectNack(container.resolvedUrl.id, canRetry);
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
	faultInjectionMaxMs: number,
) {
	new Promise<void>((resolve) => {
		// wait for the container to connect write
		container.once("closed", () => resolve());
		if (container.connectionState !== ConnectionState.Connected && !container.closed) {
			container.once("connected", () => {
				resolve();
			});
		}
	})
		.then(() => {
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
						const leaveTime = runConfig.random.integer(
							faultInjectionMinMs,
							faultInjectionMaxMs,
						);
						printStatus(
							runConfig,
							`closing in ${(leaveTime / 60000).toString().substring(0, 4)} min`,
						);
						setTimeout(() => {
							if (!container.closed) {
								container.close(new FaultInjectionError("scheduleContainerClose", false));
							}
						}, leaveTime);
					}
				}
			};
			quorum.on("removeMember", scheduleLeave);
			scheduleLeave();
		})
		.catch(async (e) =>
			runConfig.logger.sendErrorEvent(
				{
					eventName: "ScheduleLeaveFailed",
					runId: runConfig.runId,
				},
				e,
			),
		);
}

async function scheduleOffline(
	dsf: FaultInjectionDocumentServiceFactory,
	container: IContainerExperimental,
	runConfig: IRunConfig,
	offlineDelayMinMs: number,
	offlineDelayMaxMs: number,
	offlineDurationMinMs: number,
	offlineDurationMaxMs: number,
	stashPercent = 0.5,
): Promise<string | undefined> {
	return new Promise<void>((resolve) => {
		if (container.connectionState !== ConnectionState.Connected && !container.closed) {
			container.once("connected", () => resolve());
			container.once("closed", () => resolve());
			container.once("disposed", () => resolve());
		} else {
			resolve();
		}
	})
		.then(async () => {
			const schedule = async (): Promise<undefined | string> => {
				if (container.closed) {
					return undefined;
				}
				const { random } = runConfig;
				const injectionTime = random.integer(offlineDelayMinMs, offlineDelayMaxMs);
				await new Promise<void>((resolve) => setTimeout(resolve, injectionTime));

				if (container.closed) {
					return undefined;
				}
				assert(container.resolvedUrl !== undefined, "no url");
				const ds = dsf.documentServices.get(container.resolvedUrl);
				assert(!!ds, "no documentServices");
				const offlineTime = random.integer(offlineDurationMinMs, offlineDurationMaxMs);
				printStatus(runConfig, `going offline for ${offlineTime / 1000} seconds!`);
				ds.goOffline();

				await new Promise<void>((resolve) => setTimeout(resolve, offlineTime));
				if (container.closed) {
					return undefined;
				}
				if (
					runConfig.loaderConfig?.enableOfflineLoad === true &&
					random.real() < stashPercent &&
					container.closeAndGetPendingLocalState
				) {
					printStatus(runConfig, "closing offline container!");
					return container.closeAndGetPendingLocalState();
				}
				printStatus(runConfig, "going online!");
				ds.goOnline();
				return schedule();
			};
			return schedule();
		})
		.catch(async (e) => {
			runConfig.logger.sendErrorEvent(
				{
					eventName: "ScheduleOfflineFailed",
					runId: runConfig.runId,
				},
				e,
			);
			return undefined;
		});
}

async function setupOpsMetrics(
	container: IContainer,
	logger: ITelemetryLoggerExt,
	progressIntervalMs: number,
	testRuntime: IFluidDataStoreRuntime,
) {
	// Use map to cache userName instead of recomputing.
	const clientIdUserNameMap: { [clientId: string]: string } = {};

	const getUserName = (userContainer: IContainer) => {
		const clientId = userContainer.clientId;
		if (clientId !== undefined && clientId.length > 0) {
			const maybeUserName = clientIdUserNameMap[clientId];
			if (maybeUserName !== undefined) {
				return maybeUserName;
			}

			const userName: string | undefined = userContainer.getQuorum().getMember(clientId)
				?.client.user.id;
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
			const currOpSize = JSON.stringify(message).length;
			submittedOpsSize += currOpSize;
		}
	});

	let receivedOpsSize = 0;
	let receivedOps = 0;
	container.deltaManager.on("op", (message) => {
		if (message?.type === "op") {
			receivedOps++;
			const currOpSize = JSON.stringify(message).length;
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

main().catch((error) => {
	// Most of the time we'll exit the process through the process.exit() in main.
	// However, if we error outside of that try/catch block we'll catch it here.
	console.error("Error occurred during setup");
	console.error(error);
	process.exit(-1);
});
