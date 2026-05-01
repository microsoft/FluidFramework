/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

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
import * as datastore from "@fluidframework/datastore/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import { SharedArray, SharedSignal } from "@fluidframework/legacy-dds/internal";
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
// TypeScript generates incorrect imports in the d.ts file if this is not included.
import { ISharedObjectKind } from "@fluidframework/shared-object-base/internal";
import { TestFluidObjectFactory } from "@fluidframework/test-utils/internal";
import * as treeCurrent from "@fluidframework/tree/internal";
import { SharedTree } from "@fluidframework/tree/internal";
import * as semver from "semver";

// Since this project has a TypeScript configuration which errors on unused imports and types, to avoid the above import causing a compile error, a dummy usage is included.
// For this to avoid a compile error, it also has to be used somehow: exporting it is the simplest way to "use" it.
export type _fakeUsage = ISharedObjectKind<unknown>;

import { CompatKind } from "./compatOptions.js";
import {
	containerRuntimePackageEntries,
	dataRuntimePackageEntries,
	driverPackageEntries,
	loaderPackageEntries,
} from "./compatPackageList.js";
export type { PackageToInstall } from "./compatPackageList.js";
import type { PackageToInstall } from "./compatPackageList.js";
import { pkgVersion } from "./packageVersion.js";
import {
	checkInstalled,
	getRequestedVersion,
	loadPackage,
	versionHasMovedSparsedMatrix,
} from "./versionUtils.js";

/**
 * @internal
 */
export interface InstalledPackage {
	version: string;
	modulePath: string;
}

/**
 * Loads all layer APIs for the requested version. The compat workspace is expected to be
 * pre-installed via `pnpm install` (through the package `postinstall` hook).
 *
 * @remarks
 * This function no longer supports dynamically installing packages. If you need to reference a specific FF version, see explicit-versions.mjs in test-version-utils/compat-workspaces.
 * @internal
 */
export const ensurePackageInstalled = async (
	baseVersion: string,
	version: number | string,
): Promise<InstalledPackage | undefined> => {
	const requestedStr = getRequestedVersion(baseVersion, version);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return undefined;
	}

	await Promise.all([
		loadContainerRuntime(baseVersion, version),
		loadDataRuntime(baseVersion, version),
		loadLoader(baseVersion, version),
		loadDriver(baseVersion, version),
	]);

	const { version: resolvedVersion, modulePath } = checkInstalled(requestedStr);
	return { version: resolvedVersion, modulePath };
};

// This module supports synchronous functions to import packages once their install has been
// completed. Since dynamic import is async, we cache the modules by package version.
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
		return loadPackage(modulePath, pkgEntry.pkgName, pkgEntry.preferredEntrypoint);
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
): Promise<any> {
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

		// Load the "@fluidframework/server-local-server" package directly without checking for
		// version compatibility. Server packages have different versioning from client packages.
		// @fluidframework/server-local-server is not a direct dependency of the compat workspace,
		// but it is a known dependency of @fluidframework/local-driver, so use that as the base path.
		// The extra work here is done to handle the structure of pnpm's isolated node_module tree
		// (as configured in `compat-workspaces/full/.npmrc` in this package).
		// This pnpm blog post is a good illustration of that structure: https://pnpm.io/blog/2020/05/27/flat-node-modules-is-not-the-only-way
		const localDriverDependenciesPath = await fs.realpath(
			path.join(modulePath, "node_modules", "@fluidframework/local-driver"),
		);
		// Strip the trailing /node_modules/@fluidframework/local-driver to get to the path where server-local-server will also be available.
		const localServerModulePath = path.join(localDriverDependenciesPath, "..", "..", "..");
		const { LocalDeltaConnectionServer } = await loadPackage(
			localServerModulePath,
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
