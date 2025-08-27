/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mixinAttributor } from "@fluid-experimental/attributor";
import {
	TestDriverTypes,
	type OdspEndpoint,
	type RouterliciousEndpoint,
} from "@fluid-internal/test-driver-definitions";
import { FluidTestDriverConfig, createFluidTestDriver } from "@fluid-private/test-drivers";
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
	type MinimumVersionForCollab,
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
 * Determines the MinimumVersionForCollab that should be used for cross-client compatibility tests.
 *
 * In cross-client compat tests, a different version of the runtime is being used to create and load
 * containers. The MinimumVersionForCollab returned will be the lesser of the two versions:
 * - runtimeVersion: The version of the runtime that is being used to create the container.
 * - runtimeVersionForLoading: The version of the runtime that is being used to load the container.
 * Additionally, runtimeVersionForLoading is only defined in cross-client compat tests, so if it's undefined
 * we will just use runtimeVersion.
 *
 * Note: The MinimumVersionForCollab returned will only be used if a minVersionForCollab was not provided
 * in the ITestContainerConfig object.
 *
 * For example, if we are running a cross-client compat test with the following versions:
 * - runtimeVersion: "2.42.0"
 * - runtimeVersionForLoading: "1.4.0"
 * We will return "1.4.0" since it's the lower of the two versions.
 */
function getMinVersionForCollab(
	runtimeVersion: string,
	runtimeVersionForLoading: string | undefined,
): MinimumVersionForCollab {
	assertValidMinVersionForCollab(runtimeVersion);
	if (runtimeVersionForLoading === undefined) {
		// If `containerRuntimeForLoading` is not defined, then this is not a cross-client compat scenario.
		// In this case, we can use the `runtimeVersion` as the default minVersionForCollab.
		return runtimeVersion;
	}
	assertValidMinVersionForCollab(runtimeVersionForLoading);
	// If `containerRuntimeForLoading` is defined, we will use the lower of the two versions to ensure
	// compatibility between the two runtimes.
	return semver.compare(runtimeVersion, runtimeVersionForLoading) <= 0
		? runtimeVersion
		: runtimeVersionForLoading;
}

/**
 * Asserts the given version is valid semver and is type MinimumVersionForCollab.
 */
function assertValidMinVersionForCollab(
	version: string,
): asserts version is MinimumVersionForCollab {
	if (semver.valid(version) === null) {
		throw new Error(`Runtime version must be valid semver: ${version}`);
	}
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
		const runtimeCtor =
			containerOptions?.enableAttribution === true
				? mixinAttributor(apis.containerRuntime.ContainerRuntime)
				: apis.containerRuntime.ContainerRuntime;
		const factoryCtor = createTestContainerRuntimeFactory(runtimeCtor);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			containerOptions?.runtimeOptions,
			containerOptions?.minVersionForCollab ??
				getMinVersionForCollab(
					apis.containerRuntime.version,
					apis.containerRuntimeForLoading?.version,
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
			apis.containerRuntime.ContainerRuntime,
		);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			containerOptions?.runtimeOptions,
			containerOptions?.minVersionForCollab ??
				getMinVersionForCollab(
					apis.containerRuntime.version,
					apis.containerRuntimeForLoading?.version,
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
			apis.containerRuntimeForLoading.ContainerRuntime,
		);
		return new factoryCtor(
			TestDataObjectType,
			dataStoreFactory,
			containerOptions?.runtimeOptions,
			containerOptions?.minVersionForCollab ??
				getMinVersionForCollab(
					apis.containerRuntime.version,
					apis.containerRuntimeForLoading.version,
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

/**
 * Returns an object with `driverType` and `driverEndpointName` properties for use in telemetry.
 * @remarks Mostly exists to have a single place for this logic.
 *
 * @param driver - The driver type according to the config (environment or however it was provided)
 * @param odspEndpointName - The ODSP endpoint name according to the config (environment or however it was provided)
 * @param r11sEndpointName - The R11S endpoint name according to the config (environment or however it was provided)
 */
export function getDriverInformationWhenNoProviderIsAvailable(
	driver: TestDriverTypes,
	odspEndpointName: OdspEndpoint | undefined,
	r11sEndpointName: RouterliciousEndpoint | undefined,
): {
	driverType: TestDriverTypes;
	driverEndpointName: OdspEndpoint | RouterliciousEndpoint | undefined;
} {
	return {
		driverType: driver,
		driverEndpointName:
			driver === "odsp"
				? odspEndpointName
				: driver === "routerlicious" || driver === "r11s"
					? r11sEndpointName
					: undefined,
	};
}
