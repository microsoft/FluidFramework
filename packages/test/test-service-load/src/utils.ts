/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import crypto from "crypto";
import fs from "fs";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import {
	createFluidTestDriver,
	generateOdspHostStoragePolicy,
	OdspTestDriver,
} from "@fluid-private/test-drivers";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { ITelemetryBaseEvent, LogLevel } from "@fluidframework/core-interfaces";
import { assert, LazyPromise } from "@fluidframework/core-utils";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { IProvideFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IDetachedBlobStorage, Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import {
	ConfigTypes,
	createChildLogger,
	IConfigProviderBase,
} from "@fluidframework/telemetry-utils";
import {
	ITelemetryBufferedLogger,
	ITestDriver,
	TestDriverTypes,
	DriverEndpoint,
} from "@fluidframework/test-driver-definitions";
import { LocalCodeLoader } from "@fluidframework/test-utils";
import {
	generateConfigurations,
	generateLoaderOptions,
	generateRuntimeOptions,
	getOptionOverride,
} from "./optionsMatrix";
import { pkgName, pkgVersion } from "./packageVersion";
import { ILoadTestConfig, ITestConfig, ITestRunner } from "./testConfigFile";

const packageName = `${pkgName}@${pkgVersion}`;

export function writeToFile(data: string, relativeDirPath: string, fileName: string) {
	const outputDir = `${__dirname}/${relativeDirPath}`;
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	const filePath = `${outputDir}/${fileName}`;
	console.log(`Writing to file: ${filePath}`);
	fs.writeFileSync(filePath, data);
}

export class FileLogger implements ITelemetryBufferedLogger {
	public static readonly loggerP = (minLogLevel?: LogLevel) =>
		new LazyPromise<FileLogger>(async () => {
			if (process.env.FLUID_TEST_LOGGER_PKG_PATH !== undefined) {
				await import(process.env.FLUID_TEST_LOGGER_PKG_PATH);
				const logger = getTestLogger?.();
				assert(logger !== undefined, "Expected getTestLogger to return something");
				return new FileLogger(logger, minLogLevel);
			} else {
				return new FileLogger(undefined, minLogLevel);
			}
		});

	public static async createLogger(
		dimensions: {
			driverType: string;
			driverEndpointName: string | undefined;
			profile: string;
			workLoadPath: string;
			runId: number | undefined;
		},
		minLogLevel: LogLevel = LogLevel.default,
	) {
		const logger = await this.loggerP(minLogLevel);
		return createChildLogger({
			logger,
			properties: {
				all: dimensions,
			},
		});
	}

	public static async flushLogger(runInfo?: { url: string; runId?: number }) {
		await (await this.loggerP()).flush(runInfo);
	}

	private error: boolean = false;
	private readonly schema = new Map<string, number>();
	private logs: ITelemetryBaseEvent[] = [];

	private constructor(
		private readonly baseLogger?: ITelemetryBufferedLogger,
		public readonly minLogLevel?: LogLevel,
	) {}

	async flush(runInfo?: { url: string; runId?: number }): Promise<void> {
		const baseFlushP = this.baseLogger?.flush();

		if (this.error && runInfo !== undefined) {
			const logs = this.logs;
			// sort from most common column to least common
			const schema = [...this.schema].sort((a, b) => b[1] - a[1]).map((v) => v[0]);
			const data = logs.reduce(
				(file, event) =>
					// eslint-disable-next-line @typescript-eslint/no-base-to-string
					`${file}\n${schema.reduce((line, k) => `${line}${event[k] ?? ""},`, "")}`,
				schema.join(","),
			);

			writeToFile(
				data,
				`output/${crypto.createHash("md5").update(runInfo.url).digest("hex")}`,
				`${runInfo.runId ?? "orchestrator"}_${Date.now()}.csv`,
			);
		}
		this.schema.clear();
		this.error = false;
		this.logs = [];
		return baseFlushP;
	}
	send(event: ITelemetryBaseEvent): void {
		if (typeof event.testCategoryOverride === "string") {
			event.category = event.testCategoryOverride;
		} else if (
			typeof event.message === "string" &&
			event.message.includes("FaultInjectionNack")
		) {
			event.category = "generic";
		}
		this.baseLogger?.send({ ...event, hostName: pkgName, testVersion: pkgVersion });

		event.Event_Time = Date.now();
		// keep track of the frequency of every log event, as we'll sort by most common on write
		Object.keys(event).forEach((k) => this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
		if (event.category === "error") {
			this.error = true;
		}
		this.logs.push(event);
	}
}

export const createLogger = FileLogger.createLogger.bind(FileLogger);

const codeDetails: IFluidCodeDetails = {
	package: packageName,
	config: {},
};

export async function createCodeLoader(options: IContainerRuntimeOptions, workLoadPath: string) {
	// The work load path must contain a `fluidExport` which provides IFluidDataStoreFactory.
	const module = await import(`./${workLoadPath}/fluidExport`);
	const dataStoreFactory = (module.fluidExport as IProvideFluidDataStoreFactory)
		.IFluidDataStoreFactory;
	assert(
		dataStoreFactory !== undefined,
		"Invalid data store factory in workload directory's fluidExport",
	);

	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
		dataStoreFactory,
		[[dataStoreFactory.type, Promise.resolve(dataStoreFactory)]],
		undefined,
		undefined,
		options,
	);
	const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);
	return codeLoader;
}

class MockDetachedBlobStorage implements IDetachedBlobStorage {
	public readonly blobs = new Map<string, ArrayBufferLike>();

	public get size() {
		return this.blobs.size;
	}

	public getBlobIds(): string[] {
		return Array.from(this.blobs.keys());
	}

	public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const id = this.size.toString();
		this.blobs.set(id, content);
		return { id };
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		const blob = this.blobs.get(blobId);
		assert(!!blob, "blob not found");
		return blob;
	}
}

export async function initialize(
	testDriver: ITestDriver,
	seed: number,
	testConfig: ILoadTestConfig,
	workLoadPath: string,
	verbose: boolean,
	profileName: string,
	testIdn?: string,
) {
	const random = makeRandom(seed);
	const optionsOverride = getOptionOverride(testConfig, testDriver.type, testDriver.endpointName);

	const loaderOptions = random.pick(generateLoaderOptions(seed, optionsOverride?.loader));
	const containerOptions = random.pick(generateRuntimeOptions(seed, optionsOverride?.container));
	const configurations = random.pick(
		generateConfigurations(seed, optionsOverride?.configurations),
	);

	const minLogLevel = random.pick([LogLevel.verbose, LogLevel.default]);
	const logger = await createLogger(
		{
			driverType: testDriver.type,
			driverEndpointName: testDriver.endpointName,
			profile: profileName,
			workLoadPath,
			runId: undefined,
		},
		minLogLevel,
	);

	logger.sendTelemetryEvent({
		eventName: "RunConfigOptions",
		details: JSON.stringify({
			loaderOptions,
			containerOptions,
			configurations: { ...globalConfigurations, ...configurations },
			logLevel: minLogLevel,
		}),
	});

	const codeLoader = await createCodeLoader(containerOptions, workLoadPath);

	// Construct the loader
	const loader = new Loader({
		urlResolver: testDriver.createUrlResolver(),
		documentServiceFactory: testDriver.createDocumentServiceFactory(),
		codeLoader,
		logger,
		options: loaderOptions,
		detachedBlobStorage: new MockDetachedBlobStorage(),
		configProvider: configProvider(configurations),
	});

	const container: IContainer = await loader.createDetachedContainer(codeDetails);
	if ((testConfig.detachedBlobCount ?? 0) > 0) {
		assert(
			testDriver.type === "odsp",
			"attachment blobs in detached container not supported on this service",
		);
		const ds = (await container.getEntryPoint()) as ITestRunner;
		const detachedRunner = await ds.getDetachedRunner?.({
			testConfig,
			verbose,
			random,
			logger,
		});
		assert(
			detachedRunner !== undefined,
			"attachment blobs in detached container not supported by the test runner",
		);
		await Promise.all(
			[...Array(testConfig.detachedBlobCount).keys()].map(async (i) =>
				detachedRunner.writeBlob(i),
			),
		);
	}

	const testId = testIdn ?? Date.now().toString();
	assert(testId !== "", "testId specified cannot be an empty string");
	const request = testDriver.createCreateNewRequest(testId);
	await container.attach(request);
	assert(container.resolvedUrl !== undefined, "Container missing resolved URL after attach");
	const resolvedUrl = container.resolvedUrl;
	container.dispose();

	if ((testConfig.detachedBlobCount ?? 0) > 0 && testDriver.type === "odsp") {
		const url = (testDriver as OdspTestDriver).getUrlFromItemId((resolvedUrl as any).itemId);
		return url;
	}
	return testDriver.createContainerUrl(testId, resolvedUrl);
}

export async function createTestDriver(
	driver: TestDriverTypes,
	endpointName: DriverEndpoint | undefined,
	seed: number,
	runId: number | undefined,
	supportsBrowserAuth?: true,
) {
	const options = generateOdspHostStoragePolicy(seed);
	return createFluidTestDriver(driver, {
		odsp: {
			directory: "stress",
			options: options[(runId ?? seed) % options.length],
			supportsBrowserAuth,
			odspEndpointName: endpointName,
		},
		r11s: {
			r11sEndpointName: endpointName,
		},
	});
}

export function getProfile(profileArg: string, workLoadPath: string) {
	let config: ITestConfig;
	try {
		// The work load path must contain the `testConfig.json` config file.
		config = JSON.parse(fs.readFileSync(`./src/${workLoadPath}/testConfig.json`, "utf-8"));
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
	return profile;
}

export async function safeExit(code: number, url: string, runId?: number) {
	// There seems to be at least one dangling promise in ODSP Driver, give it a second to resolve
	await new Promise((resolve) => {
		setTimeout(resolve, 1000);
	});
	// Flush the logs
	await FileLogger.flushLogger({ url, runId });

	process.exit(code);
}

/**
 * Global feature gates for all tests. They can be overwritten by individual test configs.
 */
export const globalConfigurations: Record<string, ConfigTypes> = {
	"Fluid.SharedObject.DdsCallbacksTelemetrySampling": 10000,
	"Fluid.SharedObject.OpProcessingTelemetrySampling": 10000,
	"Fluid.Driver.ReadBlobTelemetrySampling": 100,
};

/**
 * Config provider to be used for managing feature gates in the stress tests.
 * It will return values based on the configs supplied as parameters if they are not found
 * in the global test configuration {@link globalConfigurations}.
 *
 * @param configs - the supplied configs
 * @returns - an instance of a config provider
 */
export const configProvider = (configs: Record<string, ConfigTypes>): IConfigProviderBase => {
	return {
		getRawConfig: (name: string): ConfigTypes => globalConfigurations[name] ?? configs[name],
	};
};
