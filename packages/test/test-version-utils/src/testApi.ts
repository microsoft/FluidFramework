/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, rmSync } from "node:fs";
import * as nodePath from "node:path";

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
	versionHasMovedSparsedMatrix,
} from "./compatPackageList.js";
export type { PackageToInstall } from "./compatPackageList.js";
import { pkgVersion } from "./packageVersion.js";
import {
	checkInstalled,
	ensureWorkspaceInstalled,
	fullWorkspaceDir,
	getRequestedVersion,
	loadPackage,
	standardWorkspaceDir,
	tryReadVersionsManifest,
} from "./versionUtils.js";

/**
 * @internal
 */
export interface InstalledPackage {
	version: string;
	modulePath: string;
}

/**
 * Ensures the workspace for the requested version is installed and all layer APIs are loaded.
 *
 * Installation uses `pnpm install --frozen-lockfile` against the committed lockfile in
 * `compat-workspaces/standard/` or `compat-workspaces/full/` as appropriate. No registry
 * queries are made at test time when the versions manifest is present.
 *
 * @internal
 */
export const ensurePackageInstalled = async (
	baseVersion: string,
	version: number | string,
	force: boolean,
): Promise<InstalledPackage | undefined> => {
	const requestedStr = getRequestedVersion(baseVersion, version);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return undefined;
	}

	// Determine which workspace contains this version and install it if needed.
	await ensureCompatWorkspaceForVersion(requestedStr, force);

	await Promise.all([
		loadContainerRuntime(baseVersion, version),
		loadDataRuntime(baseVersion, version),
		loadLoader(baseVersion, version),
		loadDriver(baseVersion, version),
	]);

	const { version: resolvedVersion, modulePath } = checkInstalled(requestedStr);
	return { version: resolvedVersion, modulePath };
};

/**
 * Installs the workspace that contains `requestedStr`. Determines the correct workspace (standard
 * or full) by checking the versions manifest and whether the version directory exists.
 */
async function ensureCompatWorkspaceForVersion(
	requestedStr: string,
	force: boolean,
): Promise<void> {
	const manifest = tryReadVersionsManifest();

	// Determine tier: if the version is in the full array (not in standard), use full workspace
	let workspaceDir = standardWorkspaceDir;
	if (manifest !== undefined) {
		const standardVersions = new Set([
			manifest.standard["n-1"],
			manifest.standard["n-2"],
			manifest.standard.ocv,
			...(manifest.standard["cross-client"] ?? []),
		]);
		if (!standardVersions.has(requestedStr) && manifest.full.includes(requestedStr)) {
			workspaceDir = fullWorkspaceDir;
		}
	} else {
		// No manifest: check which workspace directory contains the version dir, fall back to standard
		const { version } = checkInstalled(requestedStr);
		const inFull = !existsSync(nodePath.join(standardWorkspaceDir, version));
		if (inFull) workspaceDir = fullWorkspaceDir;
	}

	if (force) {
		// Remove node_modules to force reinstall
		const nodeModulesPath = nodePath.join(workspaceDir, "node_modules");
		if (existsSync(nodeModulesPath)) {
			rmSync(nodeModulesPath, { recursive: true });
		}
	}

	await ensureWorkspaceInstalled(workspaceDir);
}

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
 */
async function loadIfCompatible(
	pkgEntry: { pkgName: string; minVersion: string },
	versionToInstall: string,
	modulePath: string,
): Promise<any> {
	if (semver.gte(versionToInstall, pkgEntry.minVersion)) {
		return loadPackage(modulePath, pkgEntry.pkgName);
	}
	return undefined;
}

/**
 * Helper to load multiple packages if their requested versions are compatible.
 */
async function loadPackages(
	packageEntries: { pkgName: string; minVersion: string }[],
	version: string,
	modulePath: string,
): Promise<any> {
	const loadedPackages: Record<string, any> = {};
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
 * The compatibility mode that a test is running in.
 *
 * @internal
 */
export type CompatMode = "None" | "LayerCompat" | "CrossClientCompat";

/**
 * Returns the CompatMode for a given CompatKind.
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
