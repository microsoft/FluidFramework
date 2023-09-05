/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import {
	ITestDriver,
	TestDriverTypes,
	DriverEndpoint,
} from "@fluidframework/test-driver-definitions";
import { Loader, ConnectionState, IContainerExperimental } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IRequestHeader, LogLevel } from "@fluidframework/core-interfaces";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { getRetryDelayFromError } from "@fluidframework/driver-utils";
import { assert, delay } from "@fluidframework/core-utils";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { ILoadTest, IRunConfig } from "./loadTestDataStore";
import { createCodeLoader, createLogger, createTestDriver, getProfile, safeExit } from "./utils";
import { FaultInjectionDocumentServiceFactory } from "./faultInjectionDriver";
import {
	generateConfigurations,
	generateLoaderOptions,
	generateRuntimeOptions,
	getOptionOverride,
} from "./optionsMatrix";

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
	const enableOpsMetrics: boolean = commander.enableOpsMetrics ?? false;

	const profile = getProfile(profileName);

	if (log !== undefined) {
		process.env.DEBUG = log;
	}

	if (url === undefined) {
		console.error("Missing --url argument needed to run child process");
		process.exit(-1);
	}

	// combine the runId with the seed for generating local randoms
	// this makes runners repeatable, but ensures each runner
	// will get its own set of randoms
	const random = makeRandom(seed, runId);
	const logger = await createLogger(
		{
			runId,
			driverType: driver,
			driverEndpointName: endpoint,
			profile: profileName,
		},
		random.pick([LogLevel.verbose, LogLevel.default]),
	);

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
		result = await runnerProcess(
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
	} catch (e) {
		logger.sendErrorEvent({ eventName: "runnerFailed" }, e);
	} finally {
		await safeExit(result, url, runId);
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
): Promise<number> {
	// Assigning no-op value due to linter.
	let metricsCleanup: () => void = () => {};

	const optionsOverride = getOptionOverride(runConfig.testConfig, driver, endpoint);

	const loaderOptions = generateLoaderOptions(seed, optionsOverride?.loader);
	const containerOptions = generateRuntimeOptions(seed, optionsOverride?.container);
	const configurations = generateConfigurations(seed, optionsOverride?.configurations);

	const testDriver: ITestDriver = await createTestDriver(driver, endpoint, seed, runConfig.runId);

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
			runConfig.logger.sendTelemetryEvent({
				eventName: "RunConfigOptions",
				details: JSON.stringify({
					loaderOptions: runConfig.loaderConfig,
					containerOptions: containerOptions[runConfig.runId % containerOptions.length],
					logLevel: runConfig.logger.minLogLevel,
					configurations: configurations[runConfig.runId % configurations.length],
				}),
			});
			const loader = new Loader({
				urlResolver: testDriver.createUrlResolver(),
				documentServiceFactory,
				codeLoader: createCodeLoader(
					containerOptions[runConfig.runId % containerOptions.length],
				),
				logger: runConfig.logger,
				options: runConfig.loaderConfig,
				configProvider: {
					getRawConfig(name) {
						return configurations[runConfig.runId % configurations.length][name];
					},
				},
			});

			const stashedOps = stashedOpP ? await stashedOpP : undefined;
			stashedOpP = undefined; // delete to avoid reuse

			container = await loader.resolve({ url, headers }, stashedOps);

			container.connect();
			const test = await requestFluidObject<ILoadTest>(container, "/");

			// Retain old behavior of runtime being disposed on container close
			container.once("closed", () => container?.dispose());

			if (enableOpsMetrics) {
				const testRuntime = await test.getRuntime();
				metricsCleanup = await setupOpsMetrics(
					container,
					runConfig.logger,
					runConfig.testConfig.progressIntervalMs,
					testRuntime,
				);
			}

			// Control fault injection period through config.
			// If undefined then no fault injection.
			const faultInjection = runConfig.testConfig.faultInjectionMs;
			if (faultInjection) {
				scheduleContainerClose(
					container,
					runConfig,
					faultInjection.min,
					faultInjection.max,
				);
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
			if (container?.closed === false) {
				container?.close();
			}
			metricsCleanup();
		}
	}
	return 0;
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
								container.close();
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
			if (clientIdUserNameMap[clientId]) {
				return clientIdUserNameMap[clientId];
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
	console.error(error);
	process.exit(-1);
});
