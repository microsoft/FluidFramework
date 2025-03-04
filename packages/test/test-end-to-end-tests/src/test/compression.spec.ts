/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";

import {
	describeCompat,
	describeInstallVersions,
	getVersionedTestObjectProvider,
} from "@fluid-private/test-version-utils";
import {
	CompressionAlgorithms,
	type IContainerRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
// TODO:AB#6558: This should be provided based on the compatibility configuration.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ISharedMap, SharedMap } from "@fluidframework/map/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

import { pkgVersion } from "../packageVersion.js";

const compressionSuite = (getProvider, apis?) => {
	describe("Compression", () => {
		let provider: ITestObjectProvider;
		let localDataObject: ITestFluidObject;
		let localMap: ISharedMap;
		let remoteMap: ISharedMap;
		const defaultRuntimeOptions: IContainerRuntimeOptions = {
			compressionOptions: {
				minimumBatchSizeInBytes: 10,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
		};

		let compatOldCreateVersion: boolean = false;
		let compatOldLoaderVersion: boolean = false;

		beforeEach("createLocalAndRemoteMaps", async () => {
			provider = await getProvider();
			if (provider.type === "TestObjectProviderWithVersionedLoad") {
				compatOldCreateVersion = apis.containerRuntime.version === "1.4.0";
				compatOldLoaderVersion = apis.containerRuntimeForLoading.version === "1.4.0";
			}
		});

		async function setupContainers(
			runtimeOptions: IContainerRuntimeOptionsInternal = defaultRuntimeOptions,
		) {
			const containerConfig: ITestContainerConfig = {
				registry: [["mapKey", SharedMap.getFactory()]],
				runtimeOptions,
				fluidDataObjectType: DataObjectFactoryType.Test,
			};
			const localContainer = await provider.makeTestContainer(containerConfig);
			localDataObject =
				await getContainerEntryPointBackCompat<ITestFluidObject>(localContainer);
			localMap = await localDataObject.getSharedObject<ISharedMap>("mapKey");

			const remoteContainer = await provider.loadTestContainer(containerConfig);
			const remoteDataObject =
				await getContainerEntryPointBackCompat<ITestFluidObject>(remoteContainer);
			remoteMap = await remoteDataObject.getSharedObject<ISharedMap>("mapKey");
		}

		afterEach(() => {
			provider.reset();
		});

		it("Can compress and process compressed op", async function () {
			if (compatOldCreateVersion || compatOldLoaderVersion) {
				this.skip();
			}
			await setupContainers();
			const values = [
				generateRandomStringOfSize(100),
				generateRandomStringOfSize(100),
				generateRandomStringOfSize(100),
			];

			for (let i = 0; i < values.length; i++) {
				localMap.set(`${i}`, values[i]);
			}

			await provider.ensureSynchronized();
			for (let i = 0; i < values.length; i++) {
				assert.equal(localMap.get(`${i}`), values[i]);
				assert.equal(remoteMap.get(`${i}`), values[i]);
			}
		});

		it("Processes ops that weren't worth compressing", async function () {
			if (compatOldCreateVersion || compatOldLoaderVersion) {
				this.skip();
			}
			await setupContainers();
			const value = generateRandomStringOfSize(5);
			localMap.set("testKey", value);

			await provider.ensureSynchronized();
			assert.strictEqual(localMap.get("testKey"), value);
			assert.strictEqual(remoteMap.get("testKey"), value);
		});

		[
			{ compression: false, grouping: true, chunking: false },
			{ compression: false, grouping: false, chunking: false },
			{ compression: true, grouping: true, chunking: true },
			{ compression: true, grouping: true, chunking: false },
		].forEach((option) => {
			it(`Correctly processes messages: compression [${option.compression}] chunking [${option.chunking}] grouping [${option.grouping}]`, async function () {
				if (compatOldLoaderVersion) {
					this.skip();
				}
				// This test has unreproducible flakiness against r11s (non-FRS).
				// This test simply verifies all combinations of compression, chunking, and op grouping work end-to-end.
				if (
					provider.driver.type === "routerlicious" &&
					provider.driver.endpointName !== "frs"
				) {
					this.skip();
				}
				await setupContainers({
					compressionOptions: {
						minimumBatchSizeInBytes: option.compression ? 10 : Number.POSITIVE_INFINITY,
						compressionAlgorithm: CompressionAlgorithms.lz4,
					},
					chunkSizeInBytes: option.chunking ? 100 : Number.POSITIVE_INFINITY,
					enableGroupedBatching: option.grouping,
				});
				const values = [
					generateRandomStringOfSize(100),
					generateRandomStringOfSize(100),
					generateRandomStringOfSize(100),
				];
				localDataObject.context.containerRuntime.orderSequentially(() => {
					for (let i = 0; i < values.length; i++) {
						localMap.set(`${i}`, values[i]);
					}
				});

				await provider.ensureSynchronized();
				for (let i = 0; i < values.length; i++) {
					assert.equal(localMap.get(`${i}`), values[i]);
					assert.equal(remoteMap.get(`${i}`), values[i]);
				}
			});
		});
	});
};

describeCompat("Op Compression", "FullCompat", (getTestObjectProvider, apis) =>
	compressionSuite(async () => getTestObjectProvider(), apis),
);

const loaderWithoutCompressionField = "2.0.0-internal.1.4.6";
describeInstallVersions(
	{
		requestAbsoluteVersions: [loaderWithoutCompressionField],
	},
	/* timeoutMs: 3 minutes */ 180000,
)("Op Compression self-healing with old loader", (getProvider) =>
	compressionSuite(async () => {
		const provider = getProvider();
		// Ensure support for endpoint names for r11s driver. ODSP might need similar help at some point if we have
		// scenarios that run into issues otherwise.
		const driverConfig =
			provider.driver.endpointName !== undefined
				? {
						r11s: { r11sEndpointName: provider.driver.endpointName },
					}
				: undefined;
		return getVersionedTestObjectProvider(
			pkgVersion, // base version
			loaderWithoutCompressionField, // loader version
			{
				type: provider.driver.type,
				version: pkgVersion,
				config: driverConfig,
			}, // driver version
			pkgVersion, // runtime version
			pkgVersion, // datastore runtime version
		);
	}),
);

const generateRandomStringOfSize = (sizeInBytes: number): string =>
	crypto.randomBytes(sizeInBytes / 2).toString("hex");
