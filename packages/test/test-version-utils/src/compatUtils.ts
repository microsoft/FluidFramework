/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FluidTestDriverConfig, createFluidTestDriver } from "@fluid-internal/test-drivers";
import { IFluidLoadable, IRequest } from "@fluidframework/core-interfaces";
import {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import {
	IFluidDataStoreRuntime,
	IChannelFactory,
	IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { ISharedDirectory } from "@fluidframework/map";
import { unreachableCase } from "@fluidframework/common-utils";
import {
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	createTestContainerRuntimeFactory,
	TestObjectProvider,
} from "@fluidframework/test-utils";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { mixinAttributor } from "@fluid-experimental/attributor";
import { pkgVersion } from "./packageVersion.js";
import {
	getLoaderApi,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getDriverApi,
	CompatApis,
} from "./testApi.js";

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

export const TestDataObjectType = "@fluid-example/test-dataStore";

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

	const registryMapping: Record<string, IChannelFactory> = {};
	for (const value of Object.values(api.dds)) {
		registryMapping[value.getFactory().type] = value.getFactory();
	}

	const copyAttributesBesidesPackageVersion = (
		attributes: IChannelAttributes,
	): Omit<IChannelAttributes, "packageVersion"> => {
		const remainingAttributes: Mutable<IChannelAttributes> = JSON.parse(
			JSON.stringify(attributes),
		);
		delete remainingAttributes.packageVersion;
		return remainingAttributes;
	};

	function convertRegistry(registry: ChannelFactoryRegistry = []): ChannelFactoryRegistry {
		const oldRegistry: [string | undefined, IChannelFactory][] = [];
		for (const [key, factory] of registry) {
			const oldFactory = registryMapping[factory.type];
			if (oldFactory === undefined) {
				throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
			}

			if (oldFactory.attributes.packageVersion === factory.attributes.packageVersion) {
				// Factory created by test author is already using the old APIs: don't bother replacing it as
				// - the conversion utils here assume `.getFactory()` is parameterless, which isn't always true
				// - the test author already imported a version of the DDS which matches the current compat config.
				oldRegistry.push([key, factory]);
			} else {
				/**
				 * If you hit this assert while writing an e2e test, it likely means you created a SharedObject factory
				 * with non-default parameters. Rather than write something like:
				 *
				 * ```typescript
				 * import { SharedString } from "@fluidframework/sequence";
				 * const factory = SharedString.getFactory({ myTestFlag: true });
				 * ```
				 *
				 * use the `SharedString` provided as an argument to `describeCompat` and variants:
				 *
				 * ```typescript
				 * describeCompat("my test", (getTestObjectProvider, apis) => {
				 *     const factory = apis.dds.SharedString.getFactory({ myTestFlag: true });
				 * });
				 * ```
				 *
				 * This ensures that the factory you create depends on the correct Fluid runtime version for compat purposes,
				 * and so the test data object's registry (which is being built here) can use your factory directly.
				 */
				assert.deepEqual(
					copyAttributesBesidesPackageVersion(oldFactory.attributes),
					copyAttributesBesidesPackageVersion(factory.attributes),
					"Mismatched factory attributes.",
				);
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
export const getDataStoreFactory = createGetDataStoreFactoryFunction(getDataRuntimeApi(pkgVersion));

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
	const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
		runtime.IFluidHandleContext.resolveHandle(request);

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
			[innerRequestHandler],
		);
	};

	return new TestObjectProvider(apis.loader.Loader, driver, containerFactoryFn);
}

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
