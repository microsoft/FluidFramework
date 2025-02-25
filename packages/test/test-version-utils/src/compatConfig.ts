/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Lazy } from "@fluidframework/core-utils/internal";
import * as semver from "semver";

import {
	baseVersion,
	baseVersionForMinCompat,
	codeVersion,
	testBaseVersion,
} from "./baseVersion.js";
import {
	CompatKind,
	compatKind,
	compatVersions,
	driver,
	r11sEndpointName,
	tenantIndex,
	reinstall,
	odspEndpointName,
} from "./compatOptions.js";
import { pkgVersion } from "./packageVersion.js";
import { ensurePackageInstalled } from "./testApi.js";
import { getRequestedVersion, resolveVersion } from "./versionUtils.js";

/**
 * Represents a previous major release of a package based on the provided delta. For example, if the base version is 2.X and
 * the delta is -1, then we are trying to represent the package at version 1.X.
 * @internal
 */
export interface CompatVersion {
	base: string;
	delta: number;
}

/**
 * Generate configuration combinations for a particular compat version
 * @privateRemarks Please update this packages README.md if the default versions and config combination changes
 */
export interface CompatConfig {
	name: string;
	kind: CompatKind;
	compatVersion: number | string;
	loader?: string | number;
	driver?: string | number;
	containerRuntime?: string | number;
	dataRuntime?: string | number;
	/**
	 * Cross Version Compat Only
	 * Version that the `TestObjectProviderWithVersionedLoad` will use to create the container with.
	 * (Same version will be used across all layers).
	 * This is same as compatVersion, but it's easier to use createVersion in the code as compatVersion type is number | string.
	 */
	createVersion?: string;
	/**
	 * Cross Version Compat Only
	 * Version that the `TestObjectProviderWithVersionedLoad` will use to load the container with.
	 * (Same version will be used across all layers).
	 */
	loadVersion?: string;
}

const defaultCompatVersions = {
	// N and N - 1
	currentVersionDeltas: [0, -1],
	// we are currently supporting 1.3.X long-term
	ltsVersions: [resolveVersion("^1.3", false)],
};

// This indicates the number of versions above 2.0.0.internal.1.y.z that we want to support for back compat.
// Currently we only want to support 2.0.0.internal.3.y.z. and above
const defaultNumOfDriverVersionsAboveV2Int1 = 2;

function genConfig(compatVersion: number | string): CompatConfig[] {
	if (compatVersion === 0) {
		return [
			{
				// include the base version if it is not the same as the package version and it is not the test build
				name: `Non-Compat${baseVersion !== pkgVersion ? ` v${baseVersion}` : ""}`,
				kind: CompatKind.None,
				compatVersion: 0,
			},
		];
	}

	const allOld = {
		loader: compatVersion,
		driver: compatVersion,
		containerRuntime: compatVersion,
		dataRuntime: compatVersion,
	};

	const compatVersionStr =
		typeof compatVersion === "string"
			? `${compatVersion} (N)`
			: `${getRequestedVersion(baseVersion, compatVersion)} (N${compatVersion})`;
	return [
		{
			name: `compat ${compatVersionStr} - old loader`,
			kind: CompatKind.Loader,
			compatVersion,
			loader: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new loader`,
			kind: CompatKind.NewLoader,
			compatVersion,
			...allOld,
			loader: undefined,
		},
		{
			name: `compat ${compatVersionStr} - old driver`,
			kind: CompatKind.Driver,
			compatVersion,
			driver: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new driver`,
			kind: CompatKind.NewDriver,
			compatVersion,
			...allOld,
			driver: undefined,
		},
		{
			name: `compat ${compatVersionStr} - old container runtime`,
			kind: CompatKind.ContainerRuntime,
			compatVersion,
			containerRuntime: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new container runtime`,
			kind: CompatKind.NewContainerRuntime,
			compatVersion,
			...allOld,
			containerRuntime: undefined,
		},
		{
			name: `compat ${compatVersionStr} - old data runtime`,
			kind: CompatKind.DataRuntime,
			compatVersion,
			dataRuntime: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new data runtime`,
			kind: CompatKind.NewDataRuntime,
			compatVersion,
			...allOld,
			dataRuntime: undefined,
		},
	];
}

const genLTSConfig = (compatVersion: number | string): CompatConfig[] => {
	return [
		{
			name: `compat LTS ${compatVersion} - old loader`,
			kind: CompatKind.Loader,
			compatVersion,
			loader: compatVersion,
		},
		{
			name: `compat LTS ${compatVersion} - old loader + old driver`,
			kind: CompatKind.LoaderDriver,
			compatVersion,
			driver: compatVersion,
			loader: compatVersion,
		},
	];
};

const genLoaderBackCompatConfig = (compatVersion: number): CompatConfig[] => {
	const compatVersionStr =
		typeof compatVersion === "string"
			? `${compatVersion} (N)`
			: `${getRequestedVersion(baseVersion, compatVersion)} (N${compatVersion})`;

	return [
		{
			name: `compat back ${compatVersionStr} - older loader`,
			kind: CompatKind.Loader,
			compatVersion,
			loader: compatVersion,
		},
	];
};

const genDriverLoaderBackCompatConfig = (compatVersion: number): CompatConfig[] => {
	const compatVersionStr =
		typeof compatVersion === "string"
			? `${compatVersion} (N)`
			: `${getRequestedVersion(baseVersion, compatVersion)} (N${compatVersion})`;
	return [
		{
			name: `compat back ${compatVersionStr} - older loader + older driver`,
			kind: CompatKind.LoaderDriver,
			compatVersion,
			driver: compatVersion,
			loader: compatVersion,
		},
	];
};

const getNumberOfVersionsToGoBack = (numOfVersionsAboveV2Int1: number = 0): number => {
	const semverVersion = semver.parse(codeVersion);
	assert(semverVersion !== null, `Unexpected pkg version '${codeVersion}'`);

	// We have 8 internal and 5 RC versions.
	// We want to generate back compat configs for all of them because they are all considered major releases.
	// RCs can be thought of as internal 9 through 13 for this purpose, so just add them.
	const numOfInternalMajorsBeforePublic2dot0 = 8 + 5;
	// This allows us to increase our "LTS" support for certain versions above 2.0.0.internal.1.y.z, where
	// we don't want to go that far.
	return numOfInternalMajorsBeforePublic2dot0 - numOfVersionsAboveV2Int1;
};

const genFullBackCompatConfig = (driverVersionsAboveV2Int1: number = 0): CompatConfig[] => {
	// not working with new rc version
	const _configList: CompatConfig[] = [];

	const loaderVersionBackCompatCount = getNumberOfVersionsToGoBack(driverVersionsAboveV2Int1);

	// This makes the assumption N and N-1 scenarios are already fully tested thus skipping 0 and -1.
	// This loop goes as far back as 2.0.0.internal.1.y.z.
	// The idea is to generate all the versions from -2 -> - (major - 1) the current major version (i.e 2.0.0-internal.9.y.z would be -8)
	// This means as the number of majors increase the number of versions we support - this may be updated in the future.
	for (let i = 2; i < loaderVersionBackCompatCount; i++) {
		_configList.push(...genLoaderBackCompatConfig(-i));
	}

	// Splitting the two allows us to still test driver-loader while skipping older loader-driver versions are no longer supported
	const driverVersionBackCompatCount = getNumberOfVersionsToGoBack(driverVersionsAboveV2Int1);
	for (let i = 2; i < driverVersionBackCompatCount; i++) {
		_configList.push(...genDriverLoaderBackCompatConfig(-i));
	}
	return _configList;
};

/**
 * Returns true if compat test version is below the one provided as minimum version.
 * It helps to filter out lower verions configs that the ones intended to be tested on a
 * particular suite.
 */
export function isCompatVersionBelowMinVersion(minVersion: string, config: CompatConfig) {
	let lowerVersion: string | number = config.compatVersion;
	// For CrossVersion there are 2 versions being tested. Get the lower one.
	if (config.kind === CompatKind.CrossVersion) {
		lowerVersion =
			semver.compare(config.compatVersion as string, config.loadVersion as string) > 0
				? (config.loadVersion as string)
				: config.compatVersion;
	}
	const compatVersion = getRequestedVersion(baseVersionForMinCompat, lowerVersion);
	const minReqVersion = getRequestedVersion(testBaseVersion(minVersion), minVersion);
	return semver.compare(compatVersion, minReqVersion) < 0;
}

// Helper function for genCrossVersionCompatConfig().
function genCompatConfig(createVersion: string, loadVersion: string): CompatConfig {
	return {
		name: `compat cross version - create with ${createVersion} + load with ${loadVersion}`,
		kind: CompatKind.CrossVersion,
		// Note: `compatVersion` is used to determine what versions need to be installed.
		// By setting it to `resolvedCreateVersion` we ensure both versions will eventually be
		// installed, since we switch the create/load versions in the test permutations.
		compatVersion: createVersion,
		createVersion,
		loadVersion,
	};
}
/**
 * Generates the cross version compat config permutations.
 * This will resolve to one permutation where `CompatConfig.createVersion` is set to the current version and
 * `CompatConfig.loadVersion` is set to the delta (N-1) version. Then, a second permutation where `CompatConfig.createVersion`
 * is set to the delta (N-1) version and `CompatConfig.loadVersion` is set to the current version.
 *
 * Note: `adjustMajorPublic` will be set to true when requesting versions. This will ensure that we test against
 * the latest **public** major release when using the N-1 version (instead of the most recent internal major release).
 *
 * @internal
 */
export const genCrossVersionCompatConfig = (): CompatConfig[] => {
	const currentVersion = getRequestedVersion(pkgVersion, 0);

	// Build a list of all the versions we want to test, except current version.
	const allDefaultDeltaVersions = defaultCompatVersions.currentVersionDeltas
		.filter((delta) => delta !== 0) // skip current build
		.map((delta) => getRequestedVersion(pkgVersion, delta));
	allDefaultDeltaVersions.push(...defaultCompatVersions.ltsVersions);

	// Build all combos of (current verison, prior version) & (prior version, current version)
	const configs: CompatConfig[] = [];

	for (const c of allDefaultDeltaVersions) {
		configs.push(genCompatConfig(currentVersion, c));
	}

	for (const c of allDefaultDeltaVersions) {
		configs.push(genCompatConfig(c, currentVersion));
	}

	return configs;
};

export const configList = new Lazy<readonly CompatConfig[]>(() => {
	// set it in the env for parallel workers
	if (compatKind) {
		process.env.fluid__test__compatKind = JSON.stringify(compatKind);
	}
	if (compatVersions) {
		process.env.fluid__test__compatVersion = JSON.stringify(compatVersions);
	}
	process.env.fluid__test__driver = driver;
	process.env.fluid__test__r11sEndpointName = r11sEndpointName;
	process.env.fluid__test__odspEndpointName = odspEndpointName;
	process.env.fluid__test__tenantIndex = tenantIndex.toString();
	process.env.fluid__test__baseVersion = baseVersion;

	let _configList: CompatConfig[] = [];

	// CompatVersions is set via pipeline flags. If not set, use default scenarios.
	if (!compatVersions || compatVersions.length === 0) {
		// By default run currentVersionDeltas (N/N-1), LTS, and cross version compat tests
		defaultCompatVersions.currentVersionDeltas.forEach((value) => {
			_configList.push(...genConfig(value));
		});
		defaultCompatVersions.ltsVersions.forEach((value) => {
			_configList.push(...genLTSConfig(value));
		});
		_configList.push(...genCrossVersionCompatConfig());
		// If fluid__test__backCompat=FULL is enabled, run full back compat tests
		if (process.env.fluid__test__backCompat === "FULL") {
			_configList.push(...genFullBackCompatConfig());
		}
		if (process.env.fluid__test__backCompat === "V2_INT_3") {
			_configList.push(...genFullBackCompatConfig(defaultNumOfDriverVersionsAboveV2Int1));
		}
	} else {
		compatVersions.forEach((value) => {
			switch (value) {
				case "LTS": {
					defaultCompatVersions.ltsVersions.forEach((lts) => {
						_configList.push(...genLTSConfig(lts));
					});
					break;
				}
				case "FULL": {
					_configList.push(...genFullBackCompatConfig());
					break;
				}
				case "V2_INT_3": {
					_configList.push(...genFullBackCompatConfig(defaultNumOfDriverVersionsAboveV2Int1));
					break;
				}
				case "CROSS_VERSION": {
					_configList.push(...genCrossVersionCompatConfig());
					break;
				}
				default: {
					const num = parseInt(value, 10);
					if (num.toString() === value) {
						_configList.push(...genConfig(num));
					} else {
						_configList.push(...genConfig(value));
					}
				}
			}
		});
	}

	if (compatKind !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		_configList = _configList.filter((value) => compatKind!.includes(value.kind));
	}
	return _configList;
});

/**
 * Mocha start up to ensure legacy versions are installed
 * @privateRemarks
 * This isn't currently used in a global setup hook due to https://github.com/mochajs/mocha/issues/4508.
 * Instead, we ensure that all requested compatibility versions are loaded at `describeCompat` module import time by
 * leveraging top-level await.
 *
 * This makes compatibility layer APIs (e.g. DDSes, data object, etc.) available at mocha suite creation time rather than
 * hook/test execution time, which is convenient for test authors: this sort of code can be used
 * ```ts
 * describeCompat("my suite", (getTestObjectProvider, apis) => {
 *     class MyDataObject extends apis.dataRuntime.DataObject {
 *         // ...
 *     }
 * });
 * ```
 *
 * instead of code like this:
 *
 * ```ts
 * describeCompat("my suite", (getTestObjectProvider, getApis) => {
 *
 *     const makeDataObjectClass = (apis: CompatApis) => class MyDataObject extends apis.dataRuntime.DataObject {
 *         // ...
 *     }
 *
 *     before(() => {
 *         // `getApis` can only be invoked from inside a hook or test
 *         const MyDataObject = makeDataObjectClass(getApis())
 *     });
 * });
 * ```
 *
 * If the linked github issue is ever fixed, this can be once again used as a global setup fixture.
 *
 * @internal
 */
export async function mochaGlobalSetup() {
	const versions = new Set(configList.value.map((value) => value.compatVersion));
	if (versions.size === 0) {
		return;
	}

	// Make sure we wait for all before returning, even if one of them has error.
	const installP = Array.from(versions.values()).map(async (value) => {
		const version = testBaseVersion(value);
		return ensurePackageInstalled(version, value, reinstall);
	});

	let error: unknown;
	for (const p of installP) {
		try {
			await p;
		} catch (e) {
			error = e;
		}
	}
	if (error) {
		// eslint-disable-next-line @typescript-eslint/no-throw-literal -- rethrowing the originally caught value
		throw error;
	}
}
