/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";
import { strict as assert } from "assert";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import {
	describeFullCompat,
	describeInstallVersions,
	getVersionedTestObjectProvider,
} from "@fluid-internal/test-version-utils";
import { CompressionAlgorithms } from "@fluidframework/container-runtime";
import { pkgVersion } from "../packageVersion.js";

const compressionSuite = (getProvider) => {
	describe("Compression", () => {
		let provider: ITestObjectProvider;
		let localMap: ISharedMap;
		let remoteMap: ISharedMap;
		const testContainerConfig: ITestContainerConfig = {
			registry: [["mapKey", SharedMap.getFactory()]],
			runtimeOptions: {
				compressionOptions: {
					minimumBatchSizeInBytes: 10,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
			},
			fluidDataObjectType: DataObjectFactoryType.Test,
		};

		beforeEach(async () => {
			provider = await getProvider();

			const localContainer = await provider.makeTestContainer(testContainerConfig);
			const localDataObject = await requestFluidObject<ITestFluidObject>(
				localContainer,
				"default",
			);
			localMap = await localDataObject.getSharedObject<SharedMap>("mapKey");

			const remoteContainer = await provider.loadTestContainer(testContainerConfig);
			const remoteDataObject = await requestFluidObject<ITestFluidObject>(
				remoteContainer,
				"default",
			);
			remoteMap = await remoteDataObject.getSharedObject<SharedMap>("mapKey");
		});

		afterEach(() => {
			provider.reset();
		});

		it("Can compress and process compressed op", async () => {
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

		it("Processes ops that weren't worth compressing", async () => {
			const value = generateRandomStringOfSize(5);
			localMap.set("testKey", value);

			await provider.ensureSynchronized();
			assert.strictEqual(localMap.get("testKey"), value);
			assert.strictEqual(remoteMap.get("testKey"), value);
		});
	});
};

describeFullCompat("Op Compression", (getTestObjectProvider) =>
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
		return getVersionedTestObjectProvider(
			pkgVersion, // base version
			loaderWithoutCompressionField, // loader version
			{
				type: provider.driver.type,
				version: pkgVersion,
			}, // driver version
			pkgVersion, // runtime version
			pkgVersion, // datastore runtime version
		);
	}),
);

const generateRandomStringOfSize = (sizeInBytes: number): string =>
	crypto.randomBytes(sizeInBytes / 2).toString("hex");
