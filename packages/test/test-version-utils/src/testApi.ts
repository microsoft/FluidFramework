/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as sequenceDeprecated from "@fluid-experimental/sequence-deprecated";
import { SparseMatrix } from "@fluid-experimental/sequence-deprecated";
import { DriverApi } from "@fluid-private/test-drivers";
import * as agentScheduler from "@fluidframework/agent-scheduler/internal";
import {
	BaseContainerRuntimeFactory,
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import * as cell from "@fluidframework/cell/internal";
import { SharedCell } from "@fluidframework/cell/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import * as counter from "@fluidframework/counter/internal";
import { SharedCounter } from "@fluidframework/counter/internal";
import { SharedArray, SharedSignal } from "@fluidframework/legacy-dds/internal";
import * as datastore from "@fluidframework/datastore/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
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
import * as treeCurrent from "@fluidframework/tree/internal";
import { SharedTree } from "@fluidframework/tree/internal";
import * as semver from "semver";

// TypeScript generates incorrect imports in the d.ts file if this is not included.
import { ISharedObjectKind } from "@fluidframework/shared-object-base/internal";

// Since this project has a TypeScript configuration which errors on unused imports and types, to avoid the above import causing a compile error, a dummy usage is included.
// For this to avoid a compile error, it also has to be used somehow: exporting it is the simplest way to "use" it.
export type _fakeUsage = ISharedObjectKind<unknown>;

import { pkgVersion } from "./packageVersion.js";
import {
	checkInstalled,
	ensureInstalled,
	getRequestedVersion,
	loadPackage,
	versionHasMovedSparsedMatrix,
} from "./versionUtils.js";
import { CompatKind } from "./compatOptions.js";

/**
 * The details of a package to install for compatibility testing.
 */
export interface PackageToInstall {
	/** The name of the package to install. */
	pkgName: string;
	/**
	 * The minimum version where the package should be installed.
	 * If the requested version is lower than this, the package will not be installed. This enables certain level of
	 * compatibility testing for packages which were not yet part of the Fluid Framework at certain versions.
	 * Tests are responsible to not use APIs from packages which are not installed for the requested version.
	 * For example, the "\@fluidframework/tree" package was only introduced in version 2.0.0, so for testing
	 * versions prior to that, the package will not be installed and the test should skip testing these versions.
	 */
	minVersion: string;
}

// List of driver API packages to install.
const driverPackageEntries: PackageToInstall[] = [
	{ pkgName: "@fluidframework/local-driver", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/odsp-driver", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/routerlicious-driver", minVersion: "0.56.0" },
];

// List of loader API packages to install.
const loaderPackageEntries: PackageToInstall[] = [
	{ pkgName: "@fluidframework/container-loader", minVersion: "0.56.0" },
];

// List of container runtime API packages to install.
const containerRuntimePackageEntries: PackageToInstall[] = [
	{ pkgName: "@fluidframework/container-runtime", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/aqueduct", minVersion: "0.56.0" },
];

// List of data runtime API packages to install.
const dataRuntimePackageEntries: PackageToInstall[] = [
	{ pkgName: "@fluidframework/aqueduct", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/datastore", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/test-utils", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/cell", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/counter", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/map", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/matrix", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/ordered-collection", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/register-collection", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/sequence", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/agent-scheduler", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/tree", minVersion: "2.0.0" },
];

/**
 * The list of all the packages to install for compatibility testing.
 * If this list is changed, the {@link revision} in `versionUtils.ts`should be incremented to force re-installation. If
 * not, the pipelines that run the compatibility tests may fail as the packages may be fetched from the cache.
 */
const packageListToInstall: PackageToInstall[] = [
	...driverPackageEntries,
	...loaderPackageEntries,
	...containerRuntimePackageEntries,
	...dataRuntimePackageEntries,
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
		packageListToInstall,
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
	 * @remarks The API for constructing this factory has recently changed. Use `createContainerRuntimeFactoryWithDefaultDataStore`
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
		SharedArray,
		SharedSignal,
		SharedTree,
	},
	/**
	 * Contains all APIs from imported DDS packages.
	 * Keep in mind that regardless of the DataRuntime version,
	 * the APIs will be typechecked as if they were from the latest version.
	 *
	 * @remarks Using these APIs in an e2e test puts additional burden on the test author and anyone making
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
		tree: treeCurrent,
	},
};

// #endregion

/**
 * Helper to load a package if the requested version is compatible.
 * @param pkgEntry - The package entry to check and load.
 * @param versionToInstall - The version of the package to install.
 * @param modulePath - The path to the module.
 * @returns The loaded package or undefined if not compatible.
 */
async function loadIfCompatible(
	pkgEntry: PackageToInstall,
	versionToInstall: string,
	modulePath: string,
): Promise<any> {
	// Check if the requested version satisfies the minVersion requirement
	if (semver.gte(versionToInstall, pkgEntry.minVersion)) {
		return loadPackage(modulePath, pkgEntry.pkgName);
	}
	return undefined;
}

/**
 * Helper to load multiple packages if their requested versions are compatible.
 * @param packageEntries - The package entries to check and load.
 * @param version - The version of the packages to install.
 * @param modulePath - The path to the module.
 * @returns An object containing the loaded packages.
 */
async function loadPackages(
	packageEntries: PackageToInstall[],
	version: string,
	modulePath: string,
) {
	const loadedPackages = {};
	for (const pkgEntry of packageEntries) {
		loadedPackages[pkgEntry.pkgName] = await loadIfCompatible(pkgEntry, version, modulePath);
	}
	return loadedPackages;
}

async function loadLoader(baseVersion: string, requested?: number | string): Promise<void> {
	const requestedStr = getRequestedVersion(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return;
	}

	const { version, modulePath } = checkInstalled(requestedStr);
	if (!loaderCache.has(version)) {
		const loadedPackages = await loadPackages(loaderPackageEntries, version, modulePath);
		const loader: typeof LoaderApi = {
			version,
			Loader: loadedPackages["@fluidframework/container-loader"].Loader,
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
		const loadedPackages = await loadPackages(
			containerRuntimePackageEntries,
			version,
			modulePath,
		);

		const aqueductPkg = loadedPackages["@fluidframework/aqueduct"];
		const containerRuntimePkg = loadedPackages["@fluidframework/container-runtime"];

		/* eslint-disable @typescript-eslint/no-shadow */
		const { ContainerRuntime } = containerRuntimePkg;
		const { BaseContainerRuntimeFactory, ContainerRuntimeFactoryWithDefaultDataStore } =
			aqueductPkg;
		/* eslint-enable @typescript-eslint/no-shadow */

		const containerRuntime: typeof ContainerRuntimeApi = {
			version,
			BaseContainerRuntimeFactory,
			ContainerRuntime,
			ContainerRuntimeFactoryWithDefaultDataStore,
		};
		containerRuntimeCache.set(version, containerRuntime);
	}
}

async function loadDataRuntime(
	baseVersion: string,
	requested?: number | string,
): Promise<void> {
	const requestedStr = getRequestedVersion(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return;
	}
	const { version, modulePath } = checkInstalled(requestedStr);
	if (!dataRuntimeCache.has(version)) {
		/* eslint-disable @typescript-eslint/no-shadow */

		const loadedPackages = await loadPackages(dataRuntimePackageEntries, version, modulePath);

		// Load sequenceDeprecated separately as it has special handling.
		const sequenceDeprecated = await loadPackage(
			modulePath,
			versionHasMovedSparsedMatrix(version)
				? "@fluid-experimental/sequence-deprecated"
				: "@fluidframework/sequence",
		);

		// Destructure loaded packages
		const aqueduct = loadedPackages["@fluidframework/aqueduct"];
		const datastore = loadedPackages["@fluidframework/datastore"];
		const testUtils = loadedPackages["@fluidframework/test-utils"];
		const cell = loadedPackages["@fluidframework/cell"];
		const counter = loadedPackages["@fluidframework/counter"];
		const map = loadedPackages["@fluidframework/map"];
		const matrix = loadedPackages["@fluidframework/matrix"];
		const orderedCollection = loadedPackages["@fluidframework/ordered-collection"];
		const registerCollection = loadedPackages["@fluidframework/register-collection"];
		const sequence = loadedPackages["@fluidframework/sequence"];
		const agentScheduler = loadedPackages["@fluidframework/agent-scheduler"];
		const tree = loadedPackages["@fluidframework/tree"];

		/* eslint-enable @typescript-eslint/no-shadow */
		const dataRuntime: typeof DataRuntimeApi = {
			version,
			DataObject: aqueduct?.DataObject,
			DataObjectFactory: aqueduct?.DataObjectFactory,
			FluidDataStoreRuntime: datastore?.FluidDataStoreRuntime,
			TestFluidObjectFactory: testUtils?.TestFluidObjectFactory,
			dds: {
				SharedCell: cell?.SharedCell,
				SharedCounter: counter?.SharedCounter,
				SharedDirectory: map?.SharedDirectory,
				SharedMap: map?.SharedMap,
				SharedMatrix: matrix?.SharedMatrix,
				ConsensusQueue: orderedCollection?.ConsensusQueue,
				ConsensusRegisterCollection: registerCollection?.ConsensusRegisterCollection,
				SharedString: sequence?.SharedString,
				SparseMatrix: sequenceDeprecated?.SparseMatrix,
				SharedArray,
				SharedSignal,
				SharedTree: tree?.SharedTree,
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
				tree,
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
		const loadedPackages = await loadPackages(driverPackageEntries, version, modulePath);
		const [
			{ LocalDocumentServiceFactory, LocalResolver, createLocalResolverCreateNewRequest },
			{
				OdspDocumentServiceFactory,
				OdspDriverUrlResolver,
				createOdspCreateContainerRequest,
				createOdspUrl,
			},
			{ RouterliciousDocumentServiceFactory },
		] = [
			loadedPackages["@fluidframework/local-driver"],
			loadedPackages["@fluidframework/odsp-driver"],
			loadedPackages["@fluidframework/routerlicious-driver"],
		];

		// Load the "@fluidframework/server-local-server" package directly without checking for version compatibility.
		// This is because the server packages have different versions that client packages and the versions requested
		// do not apply to server packages.
		const { LocalDeltaConnectionServer } = await loadPackage(
			modulePath,
			"@fluidframework/server-local-server",
		);

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
 * The compatibility mode that a test is running in. That can be useful in scenarios where the tests
 * want to alter their behavior based on the compat mode.
 * For example, some tests may want to run in "LayerCompat" mode but skip running in "CrossClientCompat" mode
 * because they are the feature they are testing was not available in versions that cross client compat requires.
 *
 * @internal
 */
export type CompatMode = "None" | "LayerCompat" | "CrossClientCompat";

/**
 * Returns the CompatMode for a given CompatKind.
 * @param kind - The CompatKind to convert.
 * @returns The corresponding CompatMode.
 *
 * @internal
 */
export function getCompatModeFromKind(kind: CompatKind): CompatMode {
	switch (kind) {
		case CompatKind.None:
			return "None";
		case CompatKind.CrossClient:
			return "CrossClientCompat";
		default:
			return "LayerCompat";
	}
}

/**
 * @internal
 */
export interface CompatApis {
	mode: CompatMode;
	containerRuntime: ReturnType<typeof getContainerRuntimeApi>;
	dataRuntime: ReturnType<typeof getDataRuntimeApi>;
	dds: ReturnType<typeof getDataRuntimeApi>["dds"];
	driver: ReturnType<typeof getDriverApi>;
	loader: ReturnType<typeof getLoaderApi>;

	// Cross-Client Compat APIs
	containerRuntimeForLoading?: ReturnType<typeof getContainerRuntimeApi>;
	dataRuntimeForLoading?: ReturnType<typeof getDataRuntimeApi>;
	ddsForLoading?: ReturnType<typeof getDataRuntimeApi>["dds"];
	driverForLoading?: ReturnType<typeof getDriverApi>;
	loaderForLoading?: ReturnType<typeof getLoaderApi>;
}
