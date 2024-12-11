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
import {
	OdspTestDriver,
	createFluidTestDriver,
	generateOdspHostStoragePolicy,
} from "@fluid-private/test-drivers";
import { DisconnectReason, IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	// eslint-disable-next-line import/no-deprecated
	type IDetachedBlobStorage,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ICreateBlobResponse } from "@fluidframework/driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { LocalCodeLoader } from "@fluidframework/test-utils/internal";

import { createFluidExport, type ILoadTest, type IRunConfig } from "./loadTestDataStore.js";
import {
	generateConfigurations,
	generateLoaderOptions,
	generateRuntimeOptions,
	getOptionOverride,
} from "./optionsMatrix.js";
import { pkgName, pkgVersion } from "./packageVersion.js";
import type { TestConfiguration } from "./testConfigFile.js";

const packageName = `${pkgName}@${pkgVersion}`;

const codeDetails: IFluidCodeDetails = {
	package: packageName,
	config: {},
};

export const createCodeLoader = (options?: IContainerRuntimeOptions | undefined) =>
	new LocalCodeLoader([[codeDetails, createFluidExport(options)]]);

// eslint-disable-next-line import/no-deprecated
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
	testConfig: TestConfiguration,
	verbose: boolean,
	logger: ITelemetryLoggerExt,
	requestedTestId?: string,
) {
	const random = makeRandom(seed);
	const optionsOverride = getOptionOverride(
		testConfig,
		testDriver.type,
		testDriver.endpointName,
	);

	const loaderOptions = random.pick(generateLoaderOptions(seed, optionsOverride?.loader));
	const containerRuntimeOptions = random.pick(
		generateRuntimeOptions(seed, optionsOverride?.container),
	);
	const configurations = random.pick(
		generateConfigurations(seed, optionsOverride?.configurations),
	);

	logger.sendTelemetryEvent({
		eventName: "RunConfigOptions",
		details: JSON.stringify({
			loaderOptions,
			containerOptions: containerRuntimeOptions,
			configurations: { ...globalConfigurations, ...configurations },
		}),
	});

	// Construct the loaderProps
	const loaderProps: ILoaderProps = {
		urlResolver: testDriver.createUrlResolver(),
		documentServiceFactory: testDriver.createDocumentServiceFactory(),
		codeLoader: createCodeLoader(containerRuntimeOptions),
		logger,
		options: loaderOptions,
		detachedBlobStorage: new MockDetachedBlobStorage(),
		configProvider: configProvider(configurations),
	};

	const container: IContainer = await createDetachedContainer({ ...loaderProps, codeDetails });
	if ((testConfig.detachedBlobCount ?? 0) > 0) {
		assert(
			testDriver.type === "odsp",
			"attachment blobs in detached container not supported on this service",
		);
		const ds = (await container.getEntryPoint()) as ILoadTest;
		const dsm = await ds.detached({ testConfig, verbose, random, logger });
		if (dsm !== undefined) {
			await Promise.all(
				[...Array(testConfig.detachedBlobCount).keys()].map(async (i) => dsm.writeBlob(i)),
			);
		}
	}

	const testId = requestedTestId ?? Date.now().toString();
	assert(testId !== "", "testId specified cannot be an empty string");
	const request = testDriver.createCreateNewRequest(testId);
	await container.attach(request);
	assert(container.resolvedUrl !== undefined, "Container missing resolved URL after attach");
	const resolvedUrl = container.resolvedUrl;
	container.dispose(DisconnectReason.Expected);

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
	supportsBrowserAuth: boolean,
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

/**
 * Global feature gates for all tests. They can be overwritten by individual test configs.
 */
export const globalConfigurations: Record<string, ConfigTypes> = {
	"Fluid.SharedObject.DdsCallbacksTelemetrySampling": 10000,
	"Fluid.SharedObject.OpProcessingTelemetrySampling": 10000,
	"Fluid.Driver.ReadBlobTelemetrySampling": 100,
	"Fluid.ContainerRuntime.OrderedClientElection.EnablePerformanceEvents": true,
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

export function printStatus(runConfig: IRunConfig, message: string) {
	if (runConfig.verbose) {
		console.log(`${runConfig.runId.toString().padStart(3)}> ${message}`);
	}
}
