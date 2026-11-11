/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import-x/no-nodejs-modules
import * as crypto from "crypto";

import { describeCompat, type CompatApis } from "@fluid-private/test-version-utils";
import {
	CompressionAlgorithms,
	type IContainerRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

const compressionSuite = (getProvider: () => ITestObjectProvider, apis: CompatApis): void => {
	// In cross-client compat, the local (creating) and remote (loading) clients may be different
	// versions. Use the create-side factory for makeTestContainer and the load-side factory for
	// loadTestContainer. Outside cross-client compat ddsForLoading matches dds.
	const SharedMapForCreate = apis.dds.SharedMap;
	const SharedMapForLoad = apis.ddsForLoading.SharedMap;
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

		beforeEach("getTestObjectProvider", () => {
			provider = getProvider();
		});

		async function setupContainers(
			runtimeOptions: IContainerRuntimeOptionsInternal = defaultRuntimeOptions,
			minVersionForCollab: OldestSupportedClientVersion | undefined = undefined,
		): Promise<void> {
			const createContainerConfig: ITestContainerConfig = {
				registry: [["mapKey", SharedMapForCreate.getFactory()]],
				runtimeOptions,
				fluidDataObjectType: DataObjectFactoryType.Test,
				minVersionForCollab,
			};
			const loadContainerConfig: ITestContainerConfig = {
				...createContainerConfig,
				registry: [["mapKey", SharedMapForLoad.getFactory()]],
			};
			const localContainer = await provider.makeTestContainer(createContainerConfig);
			localDataObject = (await localContainer.getEntryPoint()) as ITestFluidObject;
			localMap = await localDataObject.getSharedObject<ISharedMap>("mapKey");

			const remoteContainer = await provider.loadTestContainer(loadContainerConfig);
			const remoteDataObject = (await remoteContainer.getEntryPoint()) as ITestFluidObject;
			remoteMap = await remoteDataObject.getSharedObject<ISharedMap>("mapKey");
		}

		afterEach(() => {
			provider.reset();
		});

		it("Can compress and process compressed op", async function () {
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
				// This test has unreproducible flakiness against r11s (non-FRS).
				// This test simply verifies all combinations of compression, chunking, and op grouping work end-to-end.
				if (
					provider.driver.type === "routerlicious" &&
					provider.driver.endpointName !== "frs"
				) {
					this.skip();
				}
				await setupContainers(
					{
						compressionOptions: {
							minimumBatchSizeInBytes: option.compression ? 10 : Number.POSITIVE_INFINITY,
							compressionAlgorithm: CompressionAlgorithms.lz4,
						},
						chunkSizeInBytes: option.chunking ? 100 : Number.POSITIVE_INFINITY,
						enableGroupedBatching: option.grouping,
					},
					// We set minVersionForCollab to 2.0.0 so we can test grouping and batching features with older clients.
					// in cross-client compat tests.
					"2.0.0", // minVersionForCollab
				);
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
	compressionSuite(getTestObjectProvider, apis),
);

const generateRandomStringOfSize = (sizeInBytes: number): string =>
	crypto.randomBytes(sizeInBytes / 2).toString("hex");
