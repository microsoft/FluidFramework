/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import {
	describeCompat,
	describeInstallVersions,
	getVersionedTestObjectProvider,
} from "@fluid-private/test-version-utils";
import {
	CompressionAlgorithms,
	type IContainerRuntimeOptions,
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

const compressionSuite = (getProvider) => {
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

		beforeEach("createLocalAndRemoteMaps", async () => {
			provider = await getProvider();
		});

		async function setupContainers(
			runtimeOptions: IContainerRuntimeOptions = defaultRuntimeOptions,
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
			// TODO: Re-enable after cross version compat bugs are fixed - ADO:6287
			if (provider.type === "TestObjectProviderWithVersionedLoad") {
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
			// TODO: Re-enable after cross version compat bugs are fixed - ADO:6287
			if (provider.type === "TestObjectProviderWithVersionedLoad") {
				this.skip();
			}
			await setupContainers();
			const value = generateRandomStringOfSize(5);
			localMap.set("testKey", value);

			await provider.ensureSynchronized();
			assert.strictEqual(localMap.get("testKey"), value);
			assert.strictEqual(remoteMap.get("testKey"), value);
		});

		const messageGenerationOptions = generatePairwiseOptions<{
			/** chunking cannot happen without compression */
			compressionAndChunking:
				| {
						compression: false;
						chunking: false;
				  }
				| {
						compression: true;
						chunking: boolean;
				  };
			grouping: boolean;
		}>({
			compressionAndChunking: [
				{ compression: false, chunking: false },
				{ compression: true, chunking: false },
				{ compression: true, chunking: true },
			],
			grouping: [true, false],
		});

		messageGenerationOptions.forEach((option) => {
			it(`Correctly processes messages: compression [${option.compressionAndChunking.compression}] chunking [${option.compressionAndChunking.chunking}] grouping [${option.grouping}]`, async function () {
				// TODO: Re-enable after cross version compat bugs are fixed - ADO:6287
				if (provider.type === "TestObjectProviderWithVersionedLoad") {
					this.skip();
				}
				await setupContainers({
					compressionOptions: option.compressionAndChunking.compression
						? {
								minimumBatchSizeInBytes: 10,
								compressionAlgorithm: CompressionAlgorithms.lz4,
							}
						: undefined,
					chunkSizeInBytes: option.compressionAndChunking.chunking ? 100 : undefined,
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

describeCompat("Op Compression", "FullCompat", (getTestObjectProvider) =>
	compressionSuite(async () => getTestObjectProvider()),
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
