/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Driver API
import { DriverApi } from "@fluid-private/test-drivers";

// Loader API
import { Loader } from "@fluidframework/container-loader";

// ContainerRuntime API
import { ContainerRuntime } from "@fluidframework/container-runtime";

// Data Runtime API
import * as agentScheduler from "@fluidframework/agent-scheduler";
import * as cell from "@fluidframework/cell";
import { SharedCell } from "@fluidframework/cell";
import * as counter from "@fluidframework/counter";
import { SharedCounter } from "@fluidframework/counter";
import * as ink from "@fluidframework/ink";
import { Ink } from "@fluidframework/ink";
import * as map from "@fluidframework/map";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import * as matrix from "@fluidframework/matrix";
import { SharedMatrix } from "@fluidframework/matrix";
import * as orderedCollection from "@fluidframework/ordered-collection";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import * as registerCollection from "@fluidframework/register-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import * as sequence from "@fluidframework/sequence";
import { SharedString } from "@fluidframework/sequence";
import { TestFluidObjectFactory } from "@fluidframework/test-utils";

// ContainerRuntime and Data Runtime API
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
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
	"@fluidframework/aqueduct",
	"@fluidframework/test-utils",
	"@fluidframework/container-loader",
	"@fluidframework/container-runtime",
	"@fluidframework/cell",
	"@fluidframework/counter",
	"@fluidframework/ink",
	"@fluidframework/map",
	"@fluidframework/matrix",
	"@fluidframework/ordered-collection",
	"@fluidframework/register-collection",
	"@fluidframework/sequence",
	"@fluidframework/local-driver",
	"@fluidframework/odsp-driver",
	"@fluidframework/routerlicious-driver",
	"@fluidframework/agent-scheduler",
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
	ContainerRuntime,
	ContainerRuntimeFactoryWithDefaultDataStore,
};

/**
 * @internal
 */
export const DataRuntimeApi = {
	version: pkgVersion,
	DataObject,
	DataObjectFactory,
	TestFluidObjectFactory,
	dds: {
		SharedCell,
		SharedCounter,
		Ink,
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
		ink,
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
			Loader: (await loadPackage(modulePath, "@fluidframework/container-loader")).Loader,
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
		const containerRuntime = {
			version,
			ContainerRuntime: (await loadPackage(modulePath, "@fluidframework/container-runtime"))
				.ContainerRuntime,
			ContainerRuntimeFactoryWithDefaultDataStore: (
				await loadPackage(modulePath, "@fluidframework/aqueduct")
			).ContainerRuntimeFactoryWithDefaultDataStore,
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
			{ TestFluidObjectFactory },
			map,
			sequence,
			cell,
			counter,
			matrix,
			ink,
			orderedCollection,
			registerCollection,
			sequenceDeprecated,
			agentScheduler,
		] = await Promise.all([
			loadPackage(modulePath, "@fluidframework/aqueduct"),
			loadPackage(modulePath, "@fluidframework/test-utils"),
			loadPackage(modulePath, "@fluidframework/map"),
			loadPackage(modulePath, "@fluidframework/sequence"),
			loadPackage(modulePath, "@fluidframework/cell"),
			loadPackage(modulePath, "@fluidframework/counter"),
			loadPackage(modulePath, "@fluidframework/matrix"),
			loadPackage(modulePath, "@fluidframework/ink"),
			loadPackage(modulePath, "@fluidframework/ordered-collection"),
			loadPackage(modulePath, "@fluidframework/register-collection"),
			loadPackage(
				modulePath,
				versionHasMovedSparsedMatrix(version)
					? "@fluid-experimental/sequence-deprecated"
					: "@fluidframework/sequence",
			),
			loadPackage(modulePath, "@fluidframework/agent-scheduler"),
		]);
		const { SharedCell } = cell;
		const { SharedCounter } = counter;
		const { Ink } = ink;
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
			TestFluidObjectFactory,
			dds: {
				SharedCell,
				SharedCounter,
				Ink,
				SharedDirectory,
				SharedMap,
				SharedMatrix,
				ConsensusQueue,
				ConsensusRegisterCollection,
				SharedString,
				SparseMatrix,
			},
			packages: {
				map,
				sequence,
				cell,
				counter,
				matrix,
				ink,
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
export function getLoaderApi(
	baseVersion: string,
	requested?: number | string,
	adjustMajorPublic: boolean = false,
): typeof LoaderApi {
	const requestedStr = getRequestedVersion(baseVersion, requested, adjustMajorPublic);

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
export function getContainerRuntimeApi(
	baseVersion: string,
	requested?: number | string,
	adjustMajorPublic: boolean = false,
): typeof ContainerRuntimeApi {
	const requestedStr = getRequestedVersion(baseVersion, requested, adjustMajorPublic);
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
export function getDataRuntimeApi(
	baseVersion: string,
	requested?: number | string,
	adjustMajorPublic: boolean = false,
): typeof DataRuntimeApi {
	const requestedStr = getRequestedVersion(baseVersion, requested, adjustMajorPublic);
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
export function getDriverApi(
	baseVersion: string,
	requested?: number | string,
	adjustMajorPublic: boolean = false,
): typeof DriverApi {
	const requestedStr = getRequestedVersion(baseVersion, requested, adjustMajorPublic);

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
