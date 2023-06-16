/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Driver API
import { DriverApi } from "@fluid-internal/test-drivers";

// Loader API
import { Loader } from "@fluidframework/container-loader";

// ContainerRuntime API
import { ContainerRuntime } from "@fluidframework/container-runtime";

// Data Runtime API
import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { Ink } from "@fluidframework/ink";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedString } from "@fluidframework/sequence";
import { TestFluidObjectFactory } from "@fluidframework/test-utils";

// ContainerRuntime and Data Runtime API
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SparseMatrix } from "@fluid-experimental/sequence-deprecated";

import * as semver from "semver";
import { pkgVersion } from "./packageVersion.js";
import {
	checkInstalled,
	ensureInstalled,
	getRequestedRange,
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
];

export interface InstalledPackage {
	version: string;
	modulePath: string;
}

export const ensurePackageInstalled = async (
	baseVersion: string,
	version: number | string,
	force: boolean,
): Promise<InstalledPackage | undefined> => {
	const pkg = await ensureInstalled(getRequestedRange(baseVersion, version), packageList, force);
	await Promise.all([
		loadContainerRuntime(baseVersion, version),
		loadDataRuntime(baseVersion, version),
		loadLoader(baseVersion, version),
		loadDriver(baseVersion, version),
	]);
	return pkg;
};

// We'd like to support synchronous functions to import packages once their install has been completed.
// Since dynamic import is async, we thus cache the modules based on their package version.
const loaderCache = new Map<string, typeof LoaderApi>();
const containerRuntimeCache = new Map<string, typeof ContainerRuntimeApi>();
const dataRuntimeCache = new Map<string, typeof DataRuntimeApi>();
const driverCache = new Map<string, typeof DriverApi>();

// Current versions of the APIs
const LoaderApi = {
	version: pkgVersion,
	Loader,
};

const ContainerRuntimeApi = {
	version: pkgVersion,
	ContainerRuntime,
	ContainerRuntimeFactoryWithDefaultDataStore,
};

const DataRuntimeApi = {
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
};

async function loadLoader(
	baseVersion: string,
	requested?: number | string,
): Promise<typeof LoaderApi> {
	const requestedStr = getRequestedRange(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return LoaderApi;
	}

	const { version, modulePath } = checkInstalled(requestedStr);
	if (!loaderCache.has(version)) {
		const loader = {
			version,
			Loader: (await loadPackage(modulePath, "@fluidframework/container-loader")).Loader,
		};
		loaderCache.set(version, loader);
	}
	return loaderCache.get(version) ?? throwNotFound("Loader", version);
}

async function loadContainerRuntime(
	baseVersion: string,
	requested?: number | string,
): Promise<typeof ContainerRuntimeApi> {
	const requestedStr = getRequestedRange(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return ContainerRuntimeApi;
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
	return containerRuntimeCache.get(version) ?? throwNotFound("ContainerRuntime", version);
}

async function loadDataRuntime(
	baseVersion: string,
	requested?: number | string,
): Promise<typeof DataRuntimeApi> {
	const requestedStr = getRequestedRange(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return DataRuntimeApi;
	}
	const { version, modulePath } = checkInstalled(requestedStr);
	if (!dataRuntimeCache.has(version)) {
		/* eslint-disable @typescript-eslint/no-shadow */
		const [
			{ DataObject, DataObjectFactory },
			{ TestFluidObjectFactory },
			{ SharedMap, SharedDirectory },
			{ SharedString },
			{ SharedCell },
			{ SharedCounter },
			{ SharedMatrix },
			{ Ink },
			{ ConsensusQueue },
			{ ConsensusRegisterCollection },
			{ SparseMatrix },
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
		]);
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
		};
		dataRuntimeCache.set(version, dataRuntime);
	}
	return dataRuntimeCache.get(version) ?? throwNotFound("DataRuntime", version);
}

async function loadDriver(
	baseVersion: string,
	requested?: number | string,
): Promise<typeof DriverApi> {
	const requestedStr = getRequestedRange(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return DriverApi;
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
	return driverCache.get(version) ?? throwNotFound("Driver", version);
}

function throwNotFound(layer: string, version: string): never {
	throw new Error(`${layer}@${version} not found. Missing install step?`);
}

export function getLoaderApi(baseVersion: string, requested?: number | string): typeof LoaderApi {
	const requestedStr = getRequestedRange(baseVersion, requested);

	// If the current version satisfies the range, use it.
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return LoaderApi;
	}

	const { version } = checkInstalled(requestedStr);
	const loaderApi = loaderCache.get(version);
	return loaderApi ?? throwNotFound("Loader", version);
}

export function getContainerRuntimeApi(
	baseVersion: string,
	requested?: number | string,
): typeof ContainerRuntimeApi {
	const requestedStr = getRequestedRange(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return ContainerRuntimeApi;
	}
	const { version } = checkInstalled(requestedStr);
	return containerRuntimeCache.get(version) ?? throwNotFound("ContainerRuntime", version);
}

export function getDataRuntimeApi(
	baseVersion: string,
	requested?: number | string,
): typeof DataRuntimeApi {
	const requestedStr = getRequestedRange(baseVersion, requested);
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return DataRuntimeApi;
	}
	const { version } = checkInstalled(requestedStr);
	return dataRuntimeCache.get(version) ?? throwNotFound("DataRuntime", version);
}

export function getDriverApi(baseVersion: string, requested?: number | string): typeof DriverApi {
	const requestedStr = getRequestedRange(baseVersion, requested);

	// If the current version satisfies the range, use it.
	if (semver.satisfies(pkgVersion, requestedStr)) {
		return DriverApi;
	}

	const { version } = checkInstalled(requestedStr);
	return driverCache.get(version) ?? throwNotFound("Driver", version);
}

export interface CompatApis {
	containerRuntime: ReturnType<typeof getContainerRuntimeApi>;
	dataRuntime: ReturnType<typeof getDataRuntimeApi>;
	dds: ReturnType<typeof getDataRuntimeApi>["dds"];
	driver: ReturnType<typeof getDriverApi>;
	loader: ReturnType<typeof getLoaderApi>;
}
