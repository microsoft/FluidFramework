/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { CompressionAlgorithms } from "@fluidframework/container-runtime";
import {
	type ITestContainerConfig,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";

describeCompat("ContainerRuntime Document Schema", "FullCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	let entry: TestDataObject;

	class TestDataObject extends apis.dataRuntime.DataObject {
		public get root() {
			return super.root;
		}
	}

	function generateStringOfSize(sizeInBytes: number) {
		return new Array(sizeInBytes + 1).join("0");
	}

	async function loadContainer(options: ITestContainerConfig) {
		return provider.loadTestContainer(options);
	}

	async function getentryPoint(container: IContainer) {
		return getContainerEntryPointBackCompat<TestDataObject>(container);
	}

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider();
	});

	async function test(explicitSchemaControl: boolean, compression: boolean) {
		const options: ITestContainerConfig = {
			runtimeOptions: {
				explicitSchemaControl,
				compressionOptions: {
					minimumBatchSizeInBytes: compression ? 1000 : Infinity,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
			},
		};
		const container = await provider.makeTestContainer(options);
		entry = await getentryPoint(container);

		assert(entry);
		entry.root.set("key", generateStringOfSize(10000));

		await provider.ensureSynchronized();

		let crash = false;
		let crash2 = false;
		if (provider.type === "TestObjectProviderWithVersionedLoad") {
			assert(apis.containerRuntime !== undefined);
			assert(apis.containerRuntimeForLoading !== undefined);
			const version = apis.containerRuntime?.version;
			const version2 = apis.containerRuntimeForLoading?.version;
			// 1st container is defined by apis.containerRuntime, 2nd and 3rd are defined by apis.containerRuntimeForLoading.
			// If first container is running 1.3, then it does not understand neither compression or document schema ops,
			// and thus it will see either of those.
			crash = version?.startsWith("1.") && compression; // Note: If there is no compression, then there is no schema change as well
			crash2 = version2?.startsWith("1.") && compression;
			if (crash || crash2) {
				// 0x122 is unknown type of the operation - happens with document schema change ops that old runtime does not understand
				// 0x121 is no type - happens with compressed ops that old runtime does not understand
				const error = crash && explicitSchemaControl ? "0x122" : "0x121";
				provider.logger?.registerExpectedEvent({
					eventName: "fluid:telemetry:Container:ContainerClose",
					category: "error",
					error,
					message: error,
					errorType: "dataProcessingError",
					dataProcessingError: 1,
				});
			}
		}

		if (crash2) {
			await assert.rejects(async () => loadContainer(options));
			return;
		}

		const container2 = await loadContainer(options);
		const entry2 = await getentryPoint(container2);
		assert(entry.root.get("key").length === 10000);

		entry2.root.set("key2", generateStringOfSize(5000));
		await provider.ensureSynchronized();

		assert(!container2.closed);
		assert(crash === container.closed);
		assert(crash || entry.root.get("key2").length === 5000);

		const container3 = await loadContainer(options);
		const entry3 = await getentryPoint(container3);
		assert(entry3.root.get("key2").length === 5000);

		assert(crash === container.closed);
		assert(!container2.closed);
		assert(!container3.closed);
	}

	it("test explicitSchemaControl = false, no compression", async () => {
		await test(
			false, // explicitSchemaControl
			false, // compression
		);
	});

	it("test explicitSchemaControl = false, with compression", async () => {
		await test(
			false, // explicitSchemaControl
			true, // compression
		);
	});

	it("test explicitSchemaControl = true, no compression", async () => {
		await test(
			true, // explicitSchemaControl
			false, // compression
		);
	});

	it("test explicitSchemaControl = true, with compression", async () => {
		await test(
			true, // explicitSchemaControl
			true, // compression
		);
	});
});
