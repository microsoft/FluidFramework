/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import { FluidTestDriverConfig, createFluidTestDriver } from "@fluid-private/test-drivers";
import {
	DefaultSummaryConfiguration,
	CompressionAlgorithms,
	ICompressionRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import { FluidObject, IFluidLoadable, IRequest } from "@fluidframework/core-interfaces";
import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	IFluidDataStoreRuntime,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import { ISharedDirectory } from "@fluidframework/map/internal";
import {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	createTestContainerRuntimeFactory,
	TestObjectProvider,
	TestObjectProviderWithVersionedLoad,
} from "@fluidframework/test-utils/internal";
import * as semver from "semver";

import { pkgVersion } from "./packageVersion.js";
import {
	getLoaderApi,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	CompatApis,
} from "./testApi.js";
import { getRequestedVersion } from "./versionUtils.js";

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
	optionsArg: IContainerRuntimeOptionsInternal = {
		summaryOptions: {
			summaryConfigOverrides: {
				...DefaultSummaryConfiguration,
				...{
					initialSummarizerDelayMs: 0,
				},
			},
		},
	},
	driverType: TestDriverTypes,
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
		enableGroupedBatching = true,
		enableRuntimeIdCompressor = "on",
		// Some t9s tests timeout with small settings. This is likely due to too many ops going through.
		// Reduce chunking cut-off for such tests.
		chunkSizeInBytes = driverType === "local" ? 200 : 1000,
	} = options;

	if (version.startsWith("1.")) {
		options = {
			// None of these features are supported by 1.3
			compressionOptions: undefined,
			enableGroupedBatching: false,
			enableRuntimeIdCompressor: undefined,
			// Enable chunking.
			// We need to ensure that 1.x documents (that use chunking) can still be opened by 2.x.
			// This options does nothing for 2.x builds as chunking is only enabled if compression is enabled.
			chunkSizeInBytes,
			...options,
		};
	} else if (version.startsWith("2.0.0-rc.1.")) {
		options = {
			compressionOptions: compressorDisabled, // Can't use compression, need https://github.com/microsoft/FluidFramework/pull/20111 fix
			enableGroupedBatching,
			enableRuntimeIdCompressor: undefined, // it was boolean in RC1, switched to enum in RC2
			chunkSizeInBytes: Number.POSITIVE_INFINITY, // disabled, need https://github.com/microsoft/FluidFramework/pull/20115 fix
			...options,
		};
	} else if (version.startsWith("2.0.0-rc.2.")) {
		options = {
			compressionOptions: compressorDisabled, // Can't use compression, need https://github.com/microsoft/FluidFramework/pull/20111 fix
			enableGroupedBatching,
			// control over schema was generalized in RC3 - see https://github.com/microsoft/FluidFramework/pull/20174
			// IdCompressor settings moved around - can't enable them across versions without tripping on asserts
			enableRuntimeIdCompressor: undefined,
			chunkSizeInBytes: Number.POSITIVE_INFINITY, // disabled, need https://github.com/microsoft/FluidFramework/pull/20115 fix
			...options,
		};
	} else {
		// "2.0.0-rc.3." ++
		options = {
			compressionOptions,
			enableGroupedBatching,
			chunkSizeInBytes,
			enableRuntimeIdCompressor,
			...options,
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
			if (factory.type === "https://graph.microsoft.com/types/tree") {
				oldRegistry.push([key, factory]);
			} else {
				const oldFactory = registryMapping[factory.type];
				if (oldFactory === undefined) {
					throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
				}
				oldRegistry.push([key, oldFactory]);
			}
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
export const getDataStoreFactory = createGetDataStoreFactoryFunction(
	getDataRuntimeApi(pkgVersion),
);

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
	const type = driverConfig?.type ?? "local";

	const driver = await createFluidTestDriver(type, driverConfig?.config, apis.driver);

	const getDataStoreFactoryFn = createGetDataStoreFactoryFunction(apis.dataRuntime);
	const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
		const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
		const loadRuntimeFn =
			containerOptions?.enableAttribution === true
				? apis.containerRuntime.loadRuntimeWithAttribution
				: apis.containerRuntime.loadContainerRuntime;
		const factoryCtor = createTestContainerRuntimeFactory(loadRuntimeFn);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			filterRuntimeOptionsForVersion(
				apis.containerRuntime.version,
				containerOptions?.runtimeOptions,
				type,
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
			loader: getLoaderApi(getRequestedVersion(baseVersion, loaderVersion)),
			containerRuntime: getContainerRuntimeApi(
				getRequestedVersion(baseVersion, runtimeVersion),
			),
			dataRuntime: getDataRuntimeApi(getRequestedVersion(baseVersion, dataRuntimeVersion)),
			driver: getDriverApi(getRequestedVersion(baseVersion, driverConfig?.version)),
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

	// We want to ensure that we are testing all latest runtime features, but only if both runtimes
	// (one that creates containers and one that loads them) support them.
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
	const versionForCreating = apis.containerRuntime?.version;
	assert(versionForCreating !== undefined, "versionForCreating");
	const versionForLoading = apis.containerRuntimeForLoading?.version;
	assert(versionForLoading !== undefined, "versionForLoading");

	const minVersion =
		// First, check if any of the versions is current version of the package.
		// Current versions show up in the form of "2.0.0-dev-rc.3.0.0.251800", and semver.compare()
		// incorrectly compares them with prior minors, like "2.0.0-rc.2.0.1"
		versionForLoading === pkgVersion
			? versionForCreating
			: versionForCreating === pkgVersion
				? versionForLoading
				: semver.compare(versionForCreating, versionForLoading) < 0
					? versionForCreating
					: versionForLoading;

	const createContainerFactoryFn = (containerOptions?: ITestContainerConfig) => {
		const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
		const factoryCtor = createTestContainerRuntimeFactory(
			apis.containerRuntime.loadContainerRuntime,
		);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			filterRuntimeOptionsForVersion(
				minVersion,
				containerOptions?.runtimeOptions,
				driverConfig.type,
			),
			[innerRequestHandler],
		);
	};
	const loadContainerFactoryFn = (containerOptions?: ITestContainerConfig) => {
		if (containerOptions?.forceUseCreateVersion === true) {
			return createContainerFactoryFn(containerOptions);
		}

		const dataStoreFactory = getDataStoreFactoryFnForLoading(containerOptions);
		assert(
			apis.containerRuntimeForLoading !== undefined,
			"containerRuntimeForLoading must be defined",
		);
		const factoryCtor = createTestContainerRuntimeFactory(
			apis.containerRuntimeForLoading.loadContainerRuntime,
		);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			filterRuntimeOptionsForVersion(
				minVersion,
				containerOptions?.runtimeOptions,
				driverConfig.type,
			),
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
		// telemetry props
		{
			all: {
				testType: "TestObjectProviderWithVersionedLoad",
				testCreateVersion: versionForCreating,
				testLoadVersion: versionForLoading,
				testRuntimeOptionsVersion: minVersion,
			},
		},
	);
}
