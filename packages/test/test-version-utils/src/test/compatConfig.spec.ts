/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import * as semver from "semver";

import {
	genCrossClientCompatConfig,
	getFullBackCompatVersionDeltas,
	type CompatConfig,
} from "../compatConfig.js";
import { CompatKind } from "../compatOptions.js";
import { pkgVersion } from "../packageVersion.js";
import {
	ensureVersionLoaded,
	getContainerRuntimeApi,
	getDataRuntimeApi,
	getLoaderApi,
} from "../testApi.js";
import {
	fullWorkspaceDir,
	getRequestedVersion,
	readVersionsManifest,
	resolveRangeViaManifest,
} from "../versionUtils.js";

// Update when the compatibility-test floor changes. Keep this independent of the implementation
// constant so these tests catch accidental changes to OCV resolution.
const expectedOldestCompatibleVersion = "2.0.0";

// Update only if this checkpoint leaves the cross-client test window or its resolution policy changes;
// advancing OCV alone must not change which checkpoint release line this test verifies.
const checkpointResolutionRangeToVerify = "~2.0.0";

// Update only if the runtime's accepted compatibility settings change. This selects document features
// for the boundary factory test and is independent of the compatibility-test floor.
const factoryOldestSupportedClient = "2.0.0";

function selectConfigs(
	versions?: string[],
	driver = "local",
	backCompat?: string,
): CompatConfig[] {
	const env = { ...process.env };
	for (const key of ["compatVersion", "compatKind", "backCompat", "baseVersion"]) {
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Strip inherited test selection from the child process.
		delete env[`fluid__test__${key}`];
	}
	env.fluid__test__driver = driver;
	if (versions !== undefined) env.fluid__test__compatVersion = JSON.stringify(versions);
	if (backCompat !== undefined) env.fluid__test__backCompat = backCompat;
	return JSON.parse(
		execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`import { configList } from ${JSON.stringify(new URL("../compatConfig.js", import.meta.url).href)}; console.log(JSON.stringify(configList.value));`,
			],
			{ env, encoding: "utf8" },
		),
	) as CompatConfig[];
}

describe("compatibility selection", () => {
	it("loads entry-point and factory APIs from the exact boundary package", async () => {
		await ensureVersionLoaded(
			expectedOldestCompatibleVersion,
			expectedOldestCompatibleVersion,
		);
		const loader = getLoaderApi(expectedOldestCompatibleVersion);
		const runtime = getContainerRuntimeApi(expectedOldestCompatibleVersion);
		const dataRuntime = getDataRuntimeApi(expectedOldestCompatibleVersion);
		assert.equal(loader.version, expectedOldestCompatibleVersion);
		assert.equal(runtime.version, expectedOldestCompatibleVersion);
		assert.equal(dataRuntime.version, expectedOldestCompatibleVersion);
		assert.equal(typeof runtime.ContainerRuntime.loadRuntime, "function");
		assert.equal(
			typeof runtime.ContainerRuntime.prototype.getAliasedDataStoreEntryPoint,
			"function",
		);
		assert.equal(
			typeof runtime.ContainerRuntime.prototype.createDetachedDataStore,
			"function",
		);
		assert.equal(runtime.ContainerRuntimeFactoryWithDefaultDataStore.length, 1);
		const defaultFactory = new dataRuntime.DataObjectFactory({
			type: "boundary",
			ctor: class extends dataRuntime.DataObject {},
		});
		const factory = new runtime.ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [],
			oldestSupportedClient: factoryOldestSupportedClient,
			runtimeOptions: { summaryOptions: { summaryConfigOverrides: { state: "disabled" } } },
		});
		assert.equal(typeof factory.instantiateRuntime, "function");
	});

	it("selects both exact OCV permutations, including on ODSP", () => {
		for (const driver of ["local", "odsp"]) {
			const configs = selectConfigs(["OCV"], driver);
			assert.equal(configs.length, 2);
			assert.deepEqual(
				configs.map(({ kind }) => kind),
				[CompatKind.Loader, CompatKind.LoaderDriver],
			);
			for (const config of configs) {
				assert.equal(config.compatVersion, expectedOldestCompatibleVersion);
				assert.equal(config.loader, expectedOldestCompatibleVersion);
				assert.equal(
					config.driver,
					config.kind === CompatKind.LoaderDriver
						? expectedOldestCompatibleVersion
						: undefined,
				);
				assert.equal(config.containerRuntime, undefined);
				assert.equal(config.dataRuntime, undefined);
			}
		}
	});

	it("bounds FULL and generated workspace packages at the expected OCV floor", () => {
		const configs = selectConfigs(["FULL"]);
		assert(configs.length > 0);
		assert.deepEqual(
			configs,
			selectConfigs(undefined, "local", "FULL").filter((config) =>
				config.name.startsWith("compat back -"),
			),
		);
		for (const config of configs) {
			assert(
				[CompatKind.Loader, CompatKind.LoaderDriver].includes(
					config.kind as "Loader" | "LoaderDriver",
				),
			);
			const version = getRequestedVersion({
				baseVersion: pkgVersion,
				requested: config.compatVersion,
			});
			assert(semver.gte(version, expectedOldestCompatibleVersion));
			assert(!semver.prerelease(version));
			assert(readVersionsManifest().versions.includes(version));
		}
		assert(readVersionsManifest().versions.includes(expectedOldestCompatibleVersion));
		for (const version of readVersionsManifest().versions) {
			// Individually pinned suites are independent of the supported matrix floor.
			if (semver.lt(version, expectedOldestCompatibleVersion)) continue;
			const packagePath = `${fullWorkspaceDir}/${version}/package.json`;
			assert(existsSync(packagePath));
			const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
				dependencies: Record<string, string>;
			};
			assert.equal(pkg.dependencies["@fluid-experimental/sequence-deprecated"], version);
			assert.equal(pkg.dependencies["@fluidframework/container-loader"], version);
		}
		assert.deepEqual(getFullBackCompatVersionDeltas("2.20.0"), [-2]);
		assert.deepEqual(getFullBackCompatVersionDeltas("2.10.0"), []);
	});

	it("preserves non-compat, adjacent layers, checkpoints, and combined ODSP selection", () => {
		assert.deepEqual(
			selectConfigs(["0"]).map(({ kind }) => kind),
			[CompatKind.None],
		);
		const adjacent = selectConfigs(["-1"]);
		assert.equal(adjacent.length, 8);
		assert(adjacent.every(({ compatVersion }) => compatVersion === -1));
		const crossClient = selectConfigs(["CROSS_CLIENT"]);
		assert.deepEqual(crossClient, genCrossClientCompatConfig());
		// Checkpoints resolve patches independently of the exact OCV boundary.
		const checkpointVersion = resolveRangeViaManifest(checkpointResolutionRangeToVerify);
		assert.notEqual(checkpointVersion, expectedOldestCompatibleVersion);
		assert(
			crossClient.some(
				({ createVersion, loadVersion }) =>
					createVersion === checkpointVersion || loadVersion === checkpointVersion,
			),
		);
		assert.deepEqual(selectConfigs(), [
			...selectConfigs(["0"]),
			...adjacent,
			...selectConfigs(["OCV"]),
			...crossClient,
		]);
		assert.deepEqual(selectConfigs(["FULL", "OCV"], "odsp"), [
			...selectConfigs(["FULL"]),
			...selectConfigs(["OCV"]),
		]);
	});
});

describe("genCrossClientCompatConfig", () => {
	it("excludes versions below the deployed-client compatibility floor", () => {
		const configs = genCrossClientCompatConfig();
		assert.notEqual(configs.length, 0, "Expected cross-client compatibility configurations");

		for (const config of configs) {
			assert(
				config.createVersion !== undefined && config.loadVersion !== undefined,
				"Expected cross-client create and load versions",
			);
			for (const version of [config.createVersion, config.loadVersion]) {
				assert(
					semver.gte(version, lowestMinVersionForCollab),
					`${version} should not be below ${lowestMinVersionForCollab}`,
				);
			}
		}
	});
});
