/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidTestDriverConfig, createFluidTestDriver } from "@fluid-private/test-drivers";
import {
	FluidObject,
	IFluidHandleContext,
	IFluidLoadable,
	IRequest,
} from "@fluidframework/core-interfaces";
import {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ISharedDirectory } from "@fluidframework/map";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	createTestContainerRuntimeFactory,
	TestObjectProvider,
	TestObjectProviderWithVersionedLoad,
} from "@fluidframework/test-utils";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { mixinAttributor } from "@fluid-experimental/attributor";
import {
	IContainerRuntimeOptions,
	DefaultSummaryConfiguration,
	CompressionAlgorithms,
	ICompressionRuntimeOptions,
} from "@fluidframework/container-runtime";
import { pkgVersion } from "./packageVersion.js";
import {
	getLoaderApi,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	CompatApis,
} from "./testApi.js";

/**
 * @internal
 */
export const TestDataObjectType = "@fluid-example/test-dataStore";

/**
 * This function modifies container runtime options according to a version of runtime used.
 * If a version of runtime does not support some options, they are removed.
 * If a version runtime supports some options, such options are enabled to increase a chance of
 * hitting feature set controlled by such options, and thus increase chances of finding product bugs.
 *
 * @param version - a version of container runtime to be used in test
 * @param optionsArg - input runtime options (optional)
 * @returns - runtime options that should be used with a given version of container runtime
 * @internal
 */
function filterRuntimeOptionsForVersion(
	version: string,
	optionsArg: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				...DefaultSummaryConfiguration,
				...{
					initialSummarizerDelayMs: 0,
				},
			},
		},
	},
) {
	let options = { ...optionsArg };

	// No test fails with this option, it allows us to validate properly expectations and
	// implementation of services
	options.loadSequenceNumberVerification = "close";

	const compressorDisabled: ICompressionRuntimeOptions = {
		minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
		compressionAlgorithm: CompressionAlgorithms.lz4,
	};

	// These is the "maximum" config.
	const {
		compressionOptions = {
			minimumBatchSizeInBytes: 200,
			compressionAlgorithm: CompressionAlgorithms.lz4,
		},
		chunkSizeInBytes = 200,
		enableRuntimeIdCompressor = "on",
		enableGroupedBatching = true,
	} = options;

	if (version === "1.3.7") {
		options.compressionOptions = undefined;
		options.enableGroupedBatching = false;
		options.enableRuntimeIdCompressor = "off";
		options.maxBatchSizeInBytes = undefined;
		options.chunkSizeInBytes = Number.POSITIVE_INFINITY; // disabled
	} else if (version.includes("2.0.0-rc.1.0.4")) {
		options = {
			...options,
			compressionOptions: compressorDisabled, // Can't use compression, need https://github.com/microsoft/FluidFramework/pull/20111 fix
			chunkSizeInBytes: Number.POSITIVE_INFINITY, // disabled, need https://github.com/microsoft/FluidFramework/pull/20115 fix
			enableRuntimeIdCompressor,
			enableGroupedBatching,
		};
	} else if (version.includes("2.0.0-rc.2.")) {
		options = {
			...options,
			compressionOptions,
			chunkSizeInBytes,
			enableRuntimeIdCompressor,
			enableGroupedBatching,
		};
	}

	return options;
}

/**
 * @internal
 */
export interface ITestDataObject extends IFluidLoadable {
	_context: IFluidDataStoreContext;
	_runtime: IFluidDataStoreRuntime;
	_root: ISharedDirectory;
}

function createGetDataStoreFactoryFunction(api: ReturnType<typeof getDataRuntimeApi>) {
	class TestDataObject extends api.DataObject implements ITestDataObject {
		public get _context() {
			return this.context;
		}
		public get _runtime() {
			return this.runtime;
		}
		public get _root() {
			return this.root;
		}
	}

	const registryMapping = {};
	for (const value of Object.values(api.dds)) {
		registryMapping[value.getFactory().type] = value.getFactory();
	}

	function convertRegistry(registry: ChannelFactoryRegistry = []): ChannelFactoryRegistry {
		const oldRegistry: [string | undefined, IChannelFactory][] = [];
		for (const [key, factory] of registry) {
			const oldFactory = registryMapping[factory.type];
			if (oldFactory === undefined) {
				throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
			}
			oldRegistry.push([key, oldFactory]);
		}

		return oldRegistry;
	}

	return function (containerOptions?: ITestContainerConfig): IFluidDataStoreFactory {
		const registry = convertRegistry(containerOptions?.registry);
		const fluidDataObjectType = containerOptions?.fluidDataObjectType;
		switch (fluidDataObjectType) {
			case undefined:
			case DataObjectFactoryType.Primed:
				return new api.DataObjectFactory(
					TestDataObjectType,
					TestDataObject,
					[...registry].map((r) => r[1]),
					{},
				);
			case DataObjectFactoryType.Test:
				return new api.TestFluidObjectFactory(registry);
			default:
				unreachableCase(
					fluidDataObjectType,
					`Unknown data store factory type ${fluidDataObjectType}`,
				);
		}
	};
}

// Only support current version, not baseVersion support
/**
 * @internal
 */
export const getDataStoreFactory = createGetDataStoreFactoryFunction(getDataRuntimeApi(pkgVersion));

/**
 * @internal
 */
export async function getVersionedTestObjectProviderFromApis(
	apis: Omit<CompatApis, "dds">,
	driverConfig?: {
		type?: TestDriverTypes;
		config?: FluidTestDriverConfig;
	},
) {
	const driver = await createFluidTestDriver(
		driverConfig?.type ?? "local",
		driverConfig?.config,
		apis.driver,
	);

	const getDataStoreFactoryFn = createGetDataStoreFactoryFunction(apis.dataRuntime);
	const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
		const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
		const runtimeCtor =
			containerOptions?.enableAttribution === true
				? mixinAttributor(apis.containerRuntime.ContainerRuntime)
				: apis.containerRuntime.ContainerRuntime;
		const factoryCtor = createTestContainerRuntimeFactory(runtimeCtor);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			filterRuntimeOptionsForVersion(
				apis.containerRuntime.version,
				containerOptions?.runtimeOptions,
			),
		);
	};

	return new TestObjectProvider(apis.loader.Loader, driver, containerFactoryFn);
}

/**
 * @internal
 */
export async function getVersionedTestObjectProvider(
	baseVersion: string,
	loaderVersion?: number | string,
	driverConfig?: {
		type?: TestDriverTypes;
		config?: FluidTestDriverConfig;
		version?: number | string;
	},
	runtimeVersion?: number | string,
	dataRuntimeVersion?: number | string,
): Promise<TestObjectProvider> {
	return getVersionedTestObjectProviderFromApis(
		{
			loader: getLoaderApi(baseVersion, loaderVersion),
			containerRuntime: getContainerRuntimeApi(baseVersion, runtimeVersion),
			dataRuntime: getDataRuntimeApi(baseVersion, dataRuntimeVersion),
			driver: getDriverApi(baseVersion, driverConfig?.version),
		},
		driverConfig,
	);
}

/**
 * @internal
 */
export async function getCompatVersionedTestObjectProviderFromApis(
	apis: CompatApis,
	driverConfig: {
		type: TestDriverTypes;
		config: FluidTestDriverConfig;
	},
): Promise<TestObjectProviderWithVersionedLoad> {
	assert(apis.driverForLoading !== undefined, "driverForLoading must be defined");
	assert(apis.loaderForLoading !== undefined, "loaderForLoading must be defined");
	assert(apis.dataRuntimeForLoading !== undefined, "dataRuntimeForLoading must be defined");

	const driverForCreating = await createFluidTestDriver(
		driverConfig.type,
		driverConfig.config,
		apis.driver,
	);

	const driverConfigForLoading = driverConfig;
	const driverForLoading = await createFluidTestDriver(
		driverConfigForLoading.type,
		driverConfigForLoading.config,
		apis.driverForLoading,
	);

	const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
		(
			runtime as any as Required<FluidObject<IFluidHandleContext>>
		).IFluidHandleContext.resolveHandle(request);

	const getDataStoreFactoryFn = createGetDataStoreFactoryFunction(apis.dataRuntime);
	const getDataStoreFactoryFnForLoading = createGetDataStoreFactoryFunction(
		apis.dataRuntimeForLoading,
	);

	// We want to ensure that we are testing all latest rutime features, but only if both runtimes
	// (one that creates containers and one that loads them) are supported them.
	//
	// Theoretically it should be fine to use config for apis.containerRuntimeForLoading?.version.
	// If it's higher then apis.containerRuntime, then unknown to lower version of apis.containerRuntime
	// would be ignored.
	// 
	// But TestObjectProviderWithVersionedLoad.createLoader() implementation is dumb - it resets this.useCreateApi
	// on first call and thus uses apis.containerRuntimeForLoading for any container created after.
	// Many use non-first container instance to send ops, so that screws things up.
	//
	// As result, we absolutly need to use the min between two versions!
	const versionForLoading = apis.containerRuntimeForLoading?.version;
	assert(versionForLoading !== undefined, "versionForLoading");
	const versionForCreating = apis.containerRuntime?.version;
	assert(versionForCreating !== undefined, "versionForLoading");
	const minVersion =  versionForLoading.localeCompare(versionForCreating) < 0 ? versionForLoading : versionForCreating;

	const createContainerFactoryFn = (containerOptions?: ITestContainerConfig) => {
		const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
		const factoryCtor = createTestContainerRuntimeFactory(
			apis.containerRuntime.ContainerRuntime,
		);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			filterRuntimeOptionsForVersion(minVersion, containerOptions?.runtimeOptions),
			[innerRequestHandler],
		);
	};
	const loadContainerFactoryFn = (containerOptions?: ITestContainerConfig) => {
		const dataStoreFactory = getDataStoreFactoryFnForLoading(containerOptions);
		assert(
			apis.containerRuntimeForLoading !== undefined,
			"containerRuntimeForLoading must be defined",
		);
		const factoryCtor = createTestContainerRuntimeFactory(
			apis.containerRuntimeForLoading.ContainerRuntime,
		);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			// containerOptions?.runtimeOptions,
			filterRuntimeOptionsForVersion(minVersion, containerOptions?.runtimeOptions),
			[innerRequestHandler],
		);
	};

	return new TestObjectProviderWithVersionedLoad(
		apis.loader.Loader,
		apis.loaderForLoading.Loader,
		driverForCreating,
		driverForLoading,
		createContainerFactoryFn,
		loadContainerFactoryFn,
	);
}
