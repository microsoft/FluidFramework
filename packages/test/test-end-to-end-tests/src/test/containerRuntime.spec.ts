/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, ITestDataObject } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { CompressionAlgorithms } from "@fluidframework/container-runtime/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import { cleanedPackageVersion } from "@fluidframework/runtime-utils/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	type ITestContainerConfig,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
// eslint-disable-next-line import-x/no-internal-modules
import semverGt from "semver/functions/gt.js";

import { pkgVersion } from "../packageVersion.js";

describeCompat(
	"ContainerRuntime Document Schema",
	"FullCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;
		let entry: TestDataObject;

		class TestDataObject extends apis.dataRuntime.DataObject {
			public get root(): ISharedDirectory {
				return super.root;
			}
		}

		function generateStringOfSize(sizeInBytes: number): string {
			return new Array(sizeInBytes + 1).join("0");
		}

		async function loadContainer(options: ITestContainerConfig): Promise<IContainer> {
			return provider.loadTestContainer(options);
		}

		async function getEntryPoint(container: IContainer): Promise<TestDataObject> {
			return container.getEntryPoint() as Promise<TestDataObject>;
		}

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider();
		});

		async function testSchemaControl(
			explicitSchemaControl: boolean,
			compression: boolean,
			chunking: boolean,
		): Promise<void> {
			const options: ITestContainerConfig = {
				runtimeOptions: {
					explicitSchemaControl,
					compressionOptions: {
						minimumBatchSizeInBytes: compression ? 1000 : Infinity,
						compressionAlgorithm: CompressionAlgorithms.lz4,
					},
					enableGroupedBatching: compression, // Compression w/o grouping is not supported
					chunkSizeInBytes: chunking ? 200 : Infinity,
				},
				// We set minVersionForCollab to 2.0.0 so we can test schema control with older clients
				// in cross-client compat tests.
				minVersionForCollab: "2.0.0",
			};
			const container = await provider.makeTestContainer(options);
			entry = await getEntryPoint(container);

			assert(entry);
			entry.root.set("key", generateStringOfSize(10000));

			await provider.ensureSynchronized();

			const container2 = await loadContainer(options);
			const entry2 = await getEntryPoint(container2);
			assert(entry.root.get("key").length === 10000);

			entry2.root.set("key2", generateStringOfSize(5000));
			await provider.ensureSynchronized();

			assert(!container2.closed);
			assert(!container.closed);
			assert(entry.root.get("key2").length === 5000);

			const container3 = await loadContainer(options);
			const entry3 = await getEntryPoint(container3);
			await provider.ensureSynchronized();

			assert(!container.closed);
			assert(!container2.closed);
			assert(!container3.closed);

			assert(entry3.root.get("key2").length === 5000);

			entry3.root.set("key3", generateStringOfSize(15000));
			await provider.ensureSynchronized();
			assert(!container2.closed);
			assert(!container3.closed);
			assert(entry2.root.get("key3").length === 15000);

			assert(!container.closed);
			assert(entry.root.get("key3").length === 15000);

			provider.tracker.reportAndClearTrackedEvents();
		}

		const choices = [true, false];
		for (const explicitSchemaControl of choices) {
			for (const compression of choices) {
				for (const chunking of choices) {
					it(`test explicitSchemaControl = ${explicitSchemaControl}, compression = ${compression}, chunking = ${chunking}`, async function () {
						// Skip this test for R11s and ODSP as its timing is flaky.
						// This test is covering client logic and the coverage from other drivers/endpoints is sufficient.
						if (provider.driver.type === "odsp" || provider.driver.type === "r11s") {
							this.skip();
						}
						await testSchemaControl(explicitSchemaControl, compression, chunking);
					});
				}
			}
		}
	},
);

describeCompat("Id Compressor Schema change", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;

	async function loadContainer(options: ITestContainerConfig): Promise<IContainer> {
		return provider.loadTestContainer(options);
	}

	async function getEntryPoint(container: IContainer): Promise<ITestDataObject> {
		return container.getEntryPoint() as Promise<ITestDataObject>;
	}

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
	});

	it("upgrade with explicitSchemaControl = false", async () => {
		await testUpgrade(false);
	});

	it("upgrade with explicitSchemaControl = true", async () => {
		await testUpgrade(true);
	});

	async function testUpgrade(explicitSchemaControl: boolean): Promise<void> {
		const options: ITestContainerConfig = {
			runtimeOptions: {
				explicitSchemaControl: true,
			},
		};

		const container = await provider.makeTestContainer({
			runtimeOptions: {
				explicitSchemaControl: false,
				enableRuntimeIdCompressor: undefined,
			},
		});
		const entry = await getEntryPoint(container);
		entry._root.set("someKey", "someValue");

		// ensure that old container is fully loaded (connected)
		await provider.ensureSynchronized();

		const container2 = await loadContainer({
			runtimeOptions: {
				explicitSchemaControl,
				enableRuntimeIdCompressor: "delayed",
			},
		});
		const entry2 = await getEntryPoint(container2);

		// Send some ops, it will trigger schema change ops
		// This will also trigger delay loading of ID compressor for both clients!
		entry2._root.set("someKey2", "someValue");
		await provider.ensureSynchronized();

		// ID compressor loading is async. THere is no way to check when it's done.
		// To be safe, make another round of sending-waiting
		entry2._root.set("someKey2", "someValue");
		await provider.ensureSynchronized();

		// Now we should have new schema, ID compressor loaded, and be able to allocate ID range
		// In order for ID compressor to produce short IDs, the following needs to happen:
		// 1. Request unique ID (will initially get long ID)
		// 2. Send any op (will trigger ID compressor to reserve short IDs)
		entry._context.containerRuntime.generateDocumentUniqueId();
		entry._root.set("someKey3", "someValue");
		entry2._context.containerRuntime.generateDocumentUniqueId();
		entry2._root.set("someKey4", "someValue");
		await provider.ensureSynchronized();

		const id = entry._context.containerRuntime.generateDocumentUniqueId();
		const id2 = entry2._context.containerRuntime.generateDocumentUniqueId();

		if (explicitSchemaControl) {
			// Now ID compressor should give us short IDs!
			assert(Number.isInteger(id));
			assert(Number.isInteger(id2));
		} else {
			// Runtime will not change enableRuntimeIdCompressor setting if explicitSchemaControl is off
			// Other containers will not expect ID compressor ops and will fail, thus runtime does not allow this upgrade.
			// generateDocumentUniqueId() works, but gives long IDs
			assert(!Number.isInteger(id));
			assert(!Number.isInteger(id2));
		}

		assert(!container.closed);
		assert(!container2.closed);
	}
});

describeCompat(
	"minVersionForCollab (FullCompat)",
	"FullCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;
		let logger: MockLogger;

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider();
			logger = new MockLogger();
		});

		/**
		 * This test is to validate that we properly send a telemetry event when
		 * we detect that a client tries to connect to a document that has a
		 * minVersionForCollab that is greater than that clients's runtime version.
		 *
		 * TODO: Test will be enabled when AB#50563 is resolved.
		 */
		it.skip("sends a warning telemetry event for clients less than minVersionForCollab", async function () {
			const releaseMinVersionForCollabWarningAdded = "2.43.0";
			if (
				semverGt(
					releaseMinVersionForCollabWarningAdded,
					apis.containerRuntimeForLoading.version,
				) ||
				apis.containerRuntime.version !== pkgVersion
			) {
				// We are testing a very specific combination - Creating a document with a `minVersionForCollab`
				// that's greater than the loading client's runtime version. Additionally, since clients need to
				// self-report that their runtime version is too low, only clients that have the warning logic
				// can do this. Therefore, we need to also check that the loading client's runtime version is
				// greater than or equal to `releaseMinVersionForCollabWarningAdded`. If these conditions are not
				// met, we skip the test.
				this.skip();
			}

			const options: ITestContainerConfig = {
				loaderProps: {
					logger,
				},
			};
			const optionsWithMinVersionForCollab: ITestContainerConfig = {
				...options,
				minVersionForCollab: cleanedPackageVersion,
			};

			await provider.makeTestContainer(optionsWithMinVersionForCollab);
			await provider.loadTestContainer(options);

			logger.assertMatchAny(
				[
					{
						eventName: "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
						category: "generic",
						minVersionForCollab: cleanedPackageVersion,
					},
				],
				"ContainerLoadStats should have minVersionForCollab",
				false,
				false, // Don't clear the logger yet
			);

			logger.assertMatchAny(
				[
					{
						eventName: "fluid:telemetry:MinVersionForCollabWarning",
						category: "generic",
						message: `WARNING: The version of Fluid Framework used by this client (${apis.containerRuntimeForLoading.version}) is not supported by this document! Please upgrade to version ${cleanedPackageVersion} or later to ensure compatibility.`,
					},
				],
				"MinVersionForCollabWarning should be logged",
			);
		});
	},
);

describeCompat("minVersionForCollab (NoCompat)", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	let logger: MockLogger;

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
		logger = new MockLogger();
	});

	/**
	 * This tests that minVersionForCollab is updated properly when a client with a higher
	 * minVersionForCollab loads the document. If it's lower than the current minVersionForCollab,
	 * then we will continue to use the existing minVersionForCollab.
	 */
	it("minVersionForCollab is set on creation", async function () {
		const options1: ITestContainerConfig = {
			loaderProps: {
				logger,
			},
			minVersionForCollab: "2.0.0",
		};
		await provider.makeTestContainer(options1);
		logger.assertMatchAny([
			{
				eventName: "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
				category: "generic",
				minVersionForCollab: "2.0.0",
			},
		]);
	});

	it("minVersionForCollab is not updated if new version is lower", async function () {
		const options1: ITestContainerConfig = {
			loaderProps: {
				logger,
			},
			minVersionForCollab: "2.40.0",
		};
		await provider.makeTestContainer(options1);
		logger.assertMatchAny([
			{
				eventName: "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
				category: "generic",
				minVersionForCollab: "2.40.0",
			},
		]);

		const options2: ITestContainerConfig = {
			loaderProps: {
				logger,
			},
			minVersionForCollab: "2.0.0",
		};
		await provider.loadTestContainer(options2);
		logger.assertMatchAny([
			{
				eventName: "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
				category: "generic",
				minVersionForCollab: "2.40.0",
			},
		]);
	});

	it("minVersionForCollab is updated if new version is higher", async function () {
		const options1: ITestContainerConfig = {
			loaderProps: {
				logger,
			},
			minVersionForCollab: "2.0.0",
		};
		await provider.makeTestContainer(options1);
		logger.assertMatchAny([
			{
				eventName: "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
				category: "generic",
				minVersionForCollab: "2.0.0",
			},
		]);

		const options2: ITestContainerConfig = {
			loaderProps: {
				logger,
			},
			minVersionForCollab: "2.35.0",
		};
		await provider.loadTestContainer(options2);
		logger.assertMatchAny([
			{
				eventName: "fluid:telemetry:ContainerRuntime:ContainerLoadStats",
				category: "generic",
				minVersionForCollab: "2.35.0",
			},
		]);
	});
});
