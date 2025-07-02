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
	 * Cross-Client Compat Only
	 * Version that the `TestObjectProviderWithVersionedLoad` will use to create the container with.
	 * (Same version will be used across all layers).
	 * This is same as compatVersion, but it's easier to use createVersion in the code as compatVersion type is number | string.
	 */
	createVersion?: string;
	/**
	 * Cross-Client Compat Only
	 * Version that the `TestObjectProviderWithVersionedLoad` will use to load the container with.
	 * (Same version will be used across all layers).
	 */
	loadVersion?: string;
}

const defaultCompatVersions = {
	// N and N - 1
	currentVersionDeltas: [0, -1],
	// N, N-1, and N-2 for cross-client compat
	currentCrossClientVersionDeltas: [0, -1, -2],
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
	// For cross-client there are 2 versions being tested. Get the lower one.
	if (config.kind === CompatKind.CrossClient) {
		lowerVersion =
			semver.compare(config.compatVersion as string, config.loadVersion as string) > 0
				? (config.loadVersion as string)
				: config.compatVersion;
	}
	const compatVersion = getRequestedVersion(baseVersionForMinCompat, lowerVersion);
	const minReqVersion = getRequestedVersion(testBaseVersion(minVersion), minVersion);
	return semver.compare(compatVersion, minReqVersion) < 0;
}

/**
 * Returns true if the given compat config is compliant with ODSP's version requirements.
 * ! If a summarizer's version is too old (using dual-commit summaries), ODSP will nack the summaries with "Upgrade to a newer version of the Fluid client packages to summarize".
 */
export function isOdspCompatCompliant(config: CompatConfig): boolean {
	const versionIsCompliant = (version: string | number | undefined) => {
		// ! Looking at current telemetry, the oldest hit that doesn't use dual-commit summaries was version "2.0.0-rc.5.0.7"
		// ! Given this, version "2.0.0" is a fine cut off since we currently only test back to N-1
		const odspMinVersion = "2.0.0";
		return (
			version === undefined ||
			typeof version !== "string" ||
			semver.compare(version, odspMinVersion) >= 0
		);
	};

	return (
		versionIsCompliant(config.compatVersion) &&
		versionIsCompliant(config.createVersion) &&
		versionIsCompliant(config.loadVersion)
	);
}

// Helper function for genCrossClientCompatConfig().
function genCompatConfig(versionDetails: {
	createVersion: string;
	loadVersion: string;
	createDelta: string;
	loadDelta: string;
}): CompatConfig {
	const { createVersion, loadVersion, createDelta, loadDelta } = versionDetails;
	return {
		name: `compat cross-client - create with ${createVersion} (${createDelta}) + load with ${loadVersion} (${loadDelta})`,
		kind: CompatKind.CrossClient,
		// Note: `compatVersion` is used to determine what versions need to be installed.
		// By setting it to `resolvedCreateVersion` we ensure both versions will eventually be
		// installed, since we switch the create/load versions in the test permutations.
		compatVersion: createVersion,
		createVersion,
		loadVersion,
	};
}
/**
 * Generates the cross-client compat config permutations.
 * This will resolve to one permutation where `CompatConfig.createVersion` is set to the current version and
 * `CompatConfig.loadVersion` is set to the delta version. Then, a second permutation where `CompatConfig.createVersion`
 * is set to the delta version and `CompatConfig.loadVersion` is set to the current version.
 * The delta versions will be:
 * - N-1 and N-2, for "fast train" customers (i.e. \>=2.10.0 \<2.20.0, \>=2.20.0 \<2.30.0, etc.)
 * - N-1 and N-2, for "slow train" customers (i.e. ^1.0.0, ^2.0.0, etc.)
 * - LTS versions
 *
 * @remarks
 * Fast/slow trains refer to the different velocities that customers adopt new releases.
 * Fast train customers integrate most minor releases quickly and saturate on a roughly 3-month
 * cadence (this could be subject to change in the future).
 * Slow train customers mainly integrate public major releases and may take much longer to saturate
 * on any given release. Ideally, the slow train releases would also be on a regular time-based cadence, but
 * public major releases are not currently on a fixed schedule. This may change in the future.
 * We want to be able to test cross-client compat for both types of customers, so we generate permutations for
 * N/N-1 and N/N-2 for both fast and slow trains.
 *
 * @internal
 */
export const genCrossClientCompatConfig = (): CompatConfig[] => {
	const currentVersion = getRequestedVersion(pkgVersion, 0, false /* adjustMajorPublic */);

	// We build a map of all the versions we want to test the current version against.
	// The key is the version and the value is a string describing the delta from the current version.
	// We will not add any versions below 1.0.0 (only >1.0.0 is supported by our cross-client compat policy).
	// If there is a duplicate version (i.e. the N-1 public major version is the same as the LTS version),
	// then we will append the delta description to the existing delta description for that version.
	const deltaVersions: Map<string, string> = new Map();

	// N-1 and N-2 for "fast train" releases
	defaultCompatVersions.currentCrossClientVersionDeltas
		.filter((delta) => delta !== 0) // skip current build
		.forEach((delta) => {
			const v = getRequestedVersion(pkgVersion, delta, false /* adjustMajorPublic */);
			if (semver.gte(v, "1.0.0")) {
				deltaVersions.set(v, `N${delta} fast train`);
			}
		});

	// N-1 and N-2 for "slow train" releases
	// Note: We add these in a separate for loop to maintain the order of tests (minor, major, then LTS).
	defaultCompatVersions.currentCrossClientVersionDeltas
		.filter((delta) => delta !== 0) // skip current build
		.forEach((delta) => {
			const v = getRequestedVersion(pkgVersion, delta, true /* adjustMajorPublic */);
			if (semver.gte(v, "1.0.0")) {
				if (deltaVersions.has(v)) {
					deltaVersions.set(v, `${deltaVersions.get(v)}/N${delta} slow train`);
				} else {
					deltaVersions.set(v, `N${delta} slow train`);
				}
			}
		});

	// LTS releases
	for (const v of defaultCompatVersions.ltsVersions) {
		if (semver.gte(v, "1.0.0")) {
			if (deltaVersions.has(v)) {
				deltaVersions.set(v, `${deltaVersions.get(v)}/LTS`);
			} else {
				deltaVersions.set(v, "LTS");
			}
		}
	}

	// Build all combos of (current version, prior version) & (prior version, current version)
	const configs: CompatConfig[] = [];
	for (const [v, delta] of deltaVersions) {
		configs.push(
			genCompatConfig({
				createVersion: currentVersion,
				loadVersion: v,
				createDelta: "N",
				loadDelta: delta,
			}),
		);
	}
	for (const [v, delta] of deltaVersions) {
		configs.push(
			genCompatConfig({
				createVersion: v,
				loadVersion: currentVersion,
				createDelta: delta,
				loadDelta: "N",
			}),
		);
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
		// By default run currentVersionDeltas (N/N-1), LTS, and cross-client compat tests
		defaultCompatVersions.currentVersionDeltas.forEach((value) => {
			_configList.push(...genConfig(value));
		});
		defaultCompatVersions.ltsVersions.forEach((value) => {
			_configList.push(...genLTSConfig(value));
		});
		_configList.push(...genCrossClientCompatConfig());
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
				case "CROSS_CLIENT": {
					_configList.push(...genCrossClientCompatConfig());
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
