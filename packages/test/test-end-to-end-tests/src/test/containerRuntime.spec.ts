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

	async function testSchemaControl(
		explicitSchemaControl: boolean,
		compression: boolean,
		chunking: boolean,
	) {
		const options: ITestContainerConfig = {
			runtimeOptions: {
				explicitSchemaControl,
				compressionOptions: {
					minimumBatchSizeInBytes: compression ? 1000 : Infinity,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				chunkSizeInBytes: chunking ? 200 : Infinity,
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
			// 1st container is defined by apis.containerRuntime, 2nd and 3rd are defined by apis.containerRuntimeForLoading.
			// If first container is running 1.3, then it does not understand neither compression or document schema ops,
			// and thus it will see either of those.
			const version = apis.containerRuntime?.version;
			const version2 = apis.containerRuntimeForLoading?.version;

			// Second container running 1.x should fail becausse of mismatch in metadata.message information.
			// This validates that container does not go past loading stage.
			if (explicitSchemaControl && version2?.startsWith("1.")) {
				crash2 = true;
				const error = "Summary metadata mismatch";
				provider.logger?.registerExpectedEvent({
					eventName: "fluid:telemetry:Container:ContainerClose",
					category: "error",
					error,
					message: error,
					errorType: "dataCorruptionError",
					dataProcessingError: 1,
					runtimeSequenceNumber: -1,
				});
			} else if (compression) {
				// In all other cases failure happens only if compression is on. If compression is not on, then
				// - there is no chunking, as 2.0 does chunking only if compression is on. That said, if chunking is enabled (with compression),
				//   it changes point of failre (read on)
				// - compression is the only change in document schema from 1.x state (no schema stored in a document). Thus, if it's not enabled,
				//   no document schema changes happens, and no document schema change ops are sent.
				crash = version?.startsWith("1.");
				crash2 = version2?.startsWith("1.");
				if (crash || crash2) {
					// 0x122 is unknown type of the operation - happens with document schema change ops that old runtime does not understand
					// 0x121 is no type - happens with compressed ops that old runtime does not understand. This check happens early, and thus
					//       is missed if op is both compressed and chunked (as unchunking happens later)
					// 0x162 compressed & chunked op is processed by 1.3 that does not understand compression,
					//       and thus fails on empty address property (of compressed op), after unchunking happens.
					const error =
						crash && explicitSchemaControl ? "0x122" : chunking ? "0x162" : "0x121";
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
		await provider.ensureSynchronized();

		assert(crash === container.closed);
		assert(!container2.closed);
		assert(!container3.closed);

		assert(entry3.root.get("key2").length === 5000);

		entry3.root.set("key3", generateStringOfSize(15000));
		await provider.ensureSynchronized();
		assert(!container2.closed);
		assert(!container3.closed);
		assert(entry2.root.get("key3").length === 15000);

		if (!crash) {
			assert(!container.closed);
			assert(entry.root.get("key3").length === 15000);
		}

		provider.logger?.reportAndClearTrackedEvents();
	}

	const choices = [true, false];
	for (const explicitSchemaControl of choices) {
		for (const compression of choices) {
			for (const chunking of choices) {
				it(`test explicitSchemaControl = ${explicitSchemaControl}, compression = ${compression}, chunking = ${chunking}`, async () => {
					await testSchemaControl(explicitSchemaControl, compression, chunking);
				});
			}
		}
	}
});
