/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Driver API
import { DriverApi } from "@fluid-private/test-drivers";

// Loader API
import { Loader } from "@fluidframework/container-loader/internal";

// ContainerRuntime API
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";

// Data Runtime API
import * as agentScheduler from "@fluidframework/agent-scheduler/internal";
import * as cell from "@fluidframework/cell/internal";
import { SharedCell } from "@fluidframework/cell/internal";
import * as counter from "@fluidframework/counter/internal";
import { SharedCounter } from "@fluidframework/counter/internal";
import * as map from "@fluidframework/map/internal";
import { SharedDirectory, SharedMap } from "@fluidframework/map/internal";
import * as matrix from "@fluidframework/matrix/internal";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import * as orderedCollection from "@fluidframework/ordered-collection/internal";
import { ConsensusQueue } from "@fluidframework/ordered-collection/internal";
import * as registerCollection from "@fluidframework/register-collection/internal";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
import * as sequence from "@fluidframework/sequence/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { TestFluidObjectFactory } from "@fluidframework/test-utils/internal";
import * as datastore from "@fluidframework/datastore/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";

// ContainerRuntime and Data Runtime API
import {
	BaseContainerRuntimeFactory,
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import * as sequenceDeprecated from "@fluid-experimental/sequence-deprecated";
import { SparseMatrix } from "@fluid-experimental/sequence-deprecated";

import * as semver from "semver";
import { pkgVersion } from "./packageVersion.js";
import {
	checkInstalled,
	ensureInstalled,
	getRequestedVersion,
	loadPackage,
	versionHasMovedSparsedMatrix,
} from "./versionUtils.js";

// List of package that needs to be install for legacy versions
const packageList = [
	"@fluidframework/aqueduct/internal",
	"@fluidframework/datastore/internal",
	"@fluidframework/test-utils/internal",
	"@fluidframework/container-loader/internal",
	"@fluidframework/container-runtime/internal",
	"@fluidframework/cell/internal",
	"@fluidframework/counter/internal",
	"@fluidframework/map/internal",
	"@fluidframework/matrix/internal",
	"@fluidframework/ordered-collection/internal",
	"@fluidframework/register-collection/internal",
	"@fluidframework/sequence/internal",
	"@fluidframework/local-driver",
	"@fluidframework/odsp-driver",
	"@fluidframework/routerlicious-driver",
	"@fluidframework/agent-scheduler/internal",
];

/**
 * @internal
 */
export interface InstalledPackage {
	version: string;
	modulePath: string;
}

/**
 * @internal
 */
export const ensurePackageInstalled = async (
	baseVersion: string,
	version: number | string,
	force: boolean,
): Promise<InstalledPackage | undefined> => {
	const pkg = await ensureInstalled(
		getRequestedVersion(baseVersion, version),
		packageList,
		force,
	);
	await Promise.all([
		loadContainerRuntime(baseVersion, version),
		loadDataRuntime(baseVersion, version),
		loadLoader(baseVersion, version),
		loadDriver(baseVersion, version),
	]);
	return pkg;
};

// This module supports synchronous functions to import packages once their install has been completed.
// Since dynamic import is async, we thus cache the modules based on their package version.
const loaderCache = new Map<string, typeof LoaderApi>();
const containerRuntimeCache = new Map<string, typeof ContainerRuntimeApi>();
const dataRuntimeCache = new Map<string, typeof DataRuntimeApi>();
const driverCache = new Map<string, typeof DriverApi>();

// #region Current versions of the APIs.

/**
 * @internal
 */
export const LoaderApi = {
	version: pkgVersion,
	Loader,
};

/**
 * @internal
 */
export const ContainerRuntimeApi = {
	version: pkgVersion,
	BaseContainerRuntimeFactory,
	ContainerRuntime,
	/**
	 * @remarks - The API for constructing this factory has recently changed. Use `createContainerRuntimeFactoryWithDefaultDataStore`
	 * to construct safely across versions.
	 */
	ContainerRuntimeFactoryWithDefaultDataStore,
};

/**
 * @internal
 */
export const DataRuntimeApi = {
	version: pkgVersion,
	DataObject,
	DataObjectFactory,
	FluidDataStoreRuntime,
	TestFluidObjectFactory,
	// TODO: SharedTree is not included included here. Perhaps it should be added?
	dds: {
		SharedCell,
		SharedCounter,
		SharedDirectory,
		SharedMap,
		SharedMatrix,
		ConsensusQueue,
		ConsensusRegisterCollection,
		SharedString,
		SparseMatrix,
	},
	/**
	 * Contains all APIs from imported DDS packages.
	 * Keep in mind that regardless of the DataRuntime version,
	 * the APIs will be typechecked as if they were from the latest version.
	 *
	 * @remarks - Using these APIs in an e2e test puts additional burden on the test author and anyone making
	 * changes to those APIs in the future, since this will necessitate back-compat logic in the tests.
	 * Using non-stable APIs in e2e tests for that reason is discouraged.
	 */
	packages: {
		cell,
		counter,
		datastore,
		map,
		matrix,
		orderedCollection,
		registerCollection,
		sequence,
		sequenceDeprecated,
		agentScheduler,
	},
};

// #endregion

async function loadLoader(baseVersion: string, requested?: number | string): Promise<void> {
	const requestedStr = getRequestedVersion(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return;
	}

	const { version, modulePath } = checkInstalled(requestedStr);
	if (!loaderCache.has(version)) {
		const loader = {
			version,
			Loader: (await loadPackage(modulePath, "@fluidframework/container-loader/internal"))
				.Loader,
		};
		loaderCache.set(version, loader);
	}
}

async function loadContainerRuntime(
	baseVersion: string,
	requested?: number | string,
): Promise<void> {
	const requestedStr = getRequestedVersion(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return;
	}

	const { version, modulePath } = checkInstalled(requestedStr);
	if (!containerRuntimeCache.has(version)) {
		const [containerRuntimePkg, aqueductPkg] = await Promise.all([
			loadPackage(modulePath, "@fluidframework/container-runtime/internal"),
			loadPackage(modulePath, "@fluidframework/aqueduct/internal"),
		]);

		/* eslint-disable @typescript-eslint/no-shadow */
		const { ContainerRuntime } = containerRuntimePkg;
		const { BaseContainerRuntimeFactory, ContainerRuntimeFactoryWithDefaultDataStore } =
			aqueductPkg;
		/* eslint-enable @typescript-eslint/no-shadow */

		const containerRuntime = {
			version,
			BaseContainerRuntimeFactory,
			ContainerRuntime,
			ContainerRuntimeFactoryWithDefaultDataStore,
		};
		containerRuntimeCache.set(version, containerRuntime);
	}
}

async function loadDataRuntime(baseVersion: string, requested?: number | string): Promise<void> {
	const requestedStr = getRequestedVersion(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return;
	}
	const { version, modulePath } = checkInstalled(requestedStr);
	if (!dataRuntimeCache.has(version)) {
		/* eslint-disable @typescript-eslint/no-shadow */
		const [
			{ DataObject, DataObjectFactory },
			datastore,
			{ TestFluidObjectFactory },
			map,
			sequence,
			cell,
			counter,
			matrix,
			orderedCollection,
			registerCollection,
			sequenceDeprecated,
			agentScheduler,
		] = await Promise.all([
			loadPackage(modulePath, "@fluidframework/aqueduct/internal"),
			loadPackage(modulePath, "@fluidframework/datastore/internal"),
			loadPackage(modulePath, "@fluidframework/test-utils/internal"),
			loadPackage(modulePath, "@fluidframework/map/internal"),
			loadPackage(modulePath, "@fluidframework/sequence/internal"),
			loadPackage(modulePath, "@fluidframework/cell/internal"),
			loadPackage(modulePath, "@fluidframework/counter/internal"),
			loadPackage(modulePath, "@fluidframework/matrix/internal"),
			loadPackage(modulePath, "@fluidframework/ordered-collection/internal"),
			loadPackage(modulePath, "@fluidframework/register-collection/internal"),
			loadPackage(
				modulePath,
				versionHasMovedSparsedMatrix(version)
					? "@fluid-experimental/sequence-deprecated"
					: "@fluidframework/sequence/internal",
			),
			loadPackage(modulePath, "@fluidframework/agent-scheduler/internal"),
		]);
		const { FluidDataStoreRuntime } = datastore;
		const { SharedCell } = cell;
		const { SharedCounter } = counter;
		const { SharedDirectory, SharedMap } = map;
		const { SharedMatrix } = matrix;
		const { ConsensusQueue } = orderedCollection;
		const { ConsensusRegisterCollection } = registerCollection;
		const { SharedString } = sequence;
		const { SparseMatrix } = sequenceDeprecated;
		/* eslint-enable @typescript-eslint/no-shadow */

		const dataRuntime = {
			version,
			DataObject,
			DataObjectFactory,
			FluidDataStoreRuntime,
			TestFluidObjectFactory,
			dds: {
				SharedCell,
				SharedCounter,
				SharedDirectory,
				SharedMap,
				SharedMatrix,
				ConsensusQueue,
				ConsensusRegisterCollection,
				SharedString,
				SparseMatrix,
			},
			packages: {
				datastore,
				map,
				sequence,
				cell,
				counter,
				matrix,
				orderedCollection,
				registerCollection,
				sequenceDeprecated,
				agentScheduler,
			},
		};
		dataRuntimeCache.set(version, dataRuntime);
	}
}

async function loadDriver(baseVersion: string, requested?: number | string): Promise<void> {
	const requestedStr = getRequestedVersion(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return;
	}

	const { version, modulePath } = checkInstalled(requestedStr);
	if (!driverCache.has(version)) {
		const [
			{ LocalDocumentServiceFactory, LocalResolver, createLocalResolverCreateNewRequest },
			{ LocalDeltaConnectionServer },
			{
				OdspDocumentServiceFactory,
				OdspDriverUrlResolver,
				createOdspCreateContainerRequest,
				createOdspUrl,
			},
			{ RouterliciousDocumentServiceFactory },
		] = await Promise.all([
			loadPackage(modulePath, "@fluidframework/local-driver"),
			loadPackage(modulePath, "@fluidframework/server-local-server"),
			loadPackage(modulePath, "@fluidframework/odsp-driver"),
			loadPackage(modulePath, "@fluidframework/routerlicious-driver"),
		]);

		const LocalDriverApi: typeof DriverApi.LocalDriverApi = {
			version,
			LocalDocumentServiceFactory,
			LocalResolver,
			LocalDeltaConnectionServer,
			createLocalResolverCreateNewRequest,
		};

		const OdspDriverApi: typeof DriverApi.OdspDriverApi = {
			version,
			OdspDocumentServiceFactory,
			OdspDriverUrlResolver,
			createOdspCreateContainerRequest,
			createOdspUrl,
		};

		const RouterliciousDriverApi: typeof DriverApi.RouterliciousDriverApi = {
			version,
			modulePath,
			RouterliciousDocumentServiceFactory,
		};

		driverCache.set(version, {
			LocalDriverApi,
			OdspDriverApi,
			RouterliciousDriverApi,
		});
	}
}

function throwNotFound(layer: string, version: string): never {
	throw new Error(`${layer}@${version} not found. Missing install step?`);
}

/**
 * Used to fetch a given version of the Loader API.
 *
 * @param baseVersion - The version of the package prior to being adjusted.
 * @param requested - How many major versions to go back from the baseVersion. For example, -1 would indicate we want
 * to use the most recent major release prior to the baseVersion. 0 would indicate we want to use the baseVersion.
 * @param adjustMajorPublic - Indicates if we should ignore internal versions when adjusting the baseVersion. For example,
 * if `baseVersion` is 2.0.0-internal.7.4.0 and `requested` is -1, then we would return ^1.0.
 *
 * @internal
 */
export function getLoaderApi(requestedStr: string): typeof LoaderApi {
	// If the current version satisfies the range, use it.
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return LoaderApi;
	}

	const { version } = checkInstalled(requestedStr);
	const loaderApi = loaderCache.get(version);
	return loaderApi ?? throwNotFound("Loader", version);
}

/**
 * Used to fetch a given version of the Container Runtime API.
 *
 * @param baseVersion - The version of the package prior to being adjusted.
 * @param requested - How many major versions to go back from the baseVersion. For example, -1 would indicate we want
 * to use the most recent major release prior to the baseVersion. 0 would indicate we want to use the baseVersion.
 * @param adjustMajorPublic - Indicates if we should ignore internal versions when adjusting the baseVersion. For example,
 * if `baseVersion` is 2.0.0-internal.7.4.0 and `requested` is -1, then we would return ^1.0.
 *
 * @internal
 */
export function getContainerRuntimeApi(requestedStr: string): typeof ContainerRuntimeApi {
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return ContainerRuntimeApi;
	}
	const { version } = checkInstalled(requestedStr);
	return containerRuntimeCache.get(version) ?? throwNotFound("ContainerRuntime", version);
}

/**
 * Used to fetch a given version of the Data Runtime API.
 *
 * @param baseVersion - The version of the package prior to being adjusted.
 * @param requested - How many major versions to go back from the baseVersion. For example, -1 would indicate we want
 * to use the most recent major release prior to the baseVersion. 0 would indicate we want to use the baseVersion.
 * @param adjustMajorPublic - Indicates if we should ignore internal versions when adjusting the baseVersion. For example,
 * if `baseVersion` is 2.0.0-internal.7.4.0 and `requested` is -1, then we would return ^1.0.
 *
 * @internal
 */
export function getDataRuntimeApi(requestedStr: string): typeof DataRuntimeApi {
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return DataRuntimeApi;
	}
	const { version } = checkInstalled(requestedStr);
	return dataRuntimeCache.get(version) ?? throwNotFound("DataRuntime", version);
}

/**
 * Used to fetch a given version of the Driver API.
 *
 * @param baseVersion - The version of the package prior to being adjusted.
 * @param requested - How many major versions to go back from the baseVersion. For example, -1 would indicate we want
 * to use the most recent major release prior to the baseVersion. 0 would indicate we want to use the baseVersion.
 * @param adjustMajorPublic - Indicates if we should ignore internal versions when adjusting the baseVersion. For example,
 * if `baseVersion` is 2.0.0-internal.7.4.0 and `requested` is -1, then we would return ^1.0.
 *
 * @internal
 */
export function getDriverApi(requestedStr: string): typeof DriverApi {
	// If the current version satisfies the range, use it.
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return DriverApi;
	}

	const { version } = checkInstalled(requestedStr);
	return driverCache.get(version) ?? throwNotFound("Driver", version);
}

/**
 * @internal
 */
export interface CompatApis {
	containerRuntime: ReturnType<typeof getContainerRuntimeApi>;
	dataRuntime: ReturnType<typeof getDataRuntimeApi>;
	dds: ReturnType<typeof getDataRuntimeApi>["dds"];
	driver: ReturnType<typeof getDriverApi>;
	loader: ReturnType<typeof getLoaderApi>;

	// Cross Version Compat APIs
	containerRuntimeForLoading?: ReturnType<typeof getContainerRuntimeApi>;
	dataRuntimeForLoading?: ReturnType<typeof getDataRuntimeApi>;
	ddsForLoading?: ReturnType<typeof getDataRuntimeApi>["dds"];
	driverForLoading?: ReturnType<typeof getDriverApi>;
	loaderForLoading?: ReturnType<typeof getLoaderApi>;
}
