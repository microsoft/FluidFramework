/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { describeCompat, type ITestDataObject } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	CompressionAlgorithms,
	ContainerMessageType,
	type ContainerRuntime,
} from "@fluidframework/container-runtime/internal";
import type { IPendingRuntimeState } from "@fluidframework/container-runtime/internal/test/containerRuntime";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	type ITestContainerConfig,
	timeoutAwait,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { driverSupportsBlobs } from "./mockDetachedBlobStorage.js";

describeCompat(
	"Blob batch replay during schema upgrades",
	"NoCompat",
	(getTestObjectProvider) => {
		for (const upgradeSchema of [false, true]) {
			it(`preserves uploaded blobs across reconnect ${
				upgradeSchema ? "with" : "without"
			} a schema upgrade`, async function () {
				const provider = getTestObjectProvider({ resetAfterEach: true });
				if (!driverSupportsBlobs(provider.driver)) {
					this.skip();
				}

				const config: ITestContainerConfig = {
					runtimeOptions: {
						explicitSchemaControl: true,
						enableGroupedBatching: true,
						compressionOptions: {
							minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
							compressionAlgorithm: CompressionAlgorithms.lz4,
						},
						summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
					},
				};
				const creator = await provider.makeTestContainer(config);
				await waitForContainerConnection(creator);
				const url = await creator.getAbsoluteUrl("");
				assert(url !== undefined);
				creator.close();

				const loadConfig: ITestContainerConfig = {
					...config,
					runtimeOptions: {
						...config.runtimeOptions,
						compressionOptions: {
							minimumBatchSizeInBytes: upgradeSchema ? 1024 : Number.POSITIVE_INFINITY,
							compressionAlgorithm: CompressionAlgorithms.lz4,
						},
					},
				};
				const loader = provider.makeTestLoader(loadConfig);
				const container = await loader.resolve({
					url,
					headers: { [LoaderHeader.loadMode]: { deltaConnection: "none" } },
				});
				const dataStore = (await container.getEntryPoint()) as ITestDataObject;
				const runtime = dataStore._context.containerRuntime as ContainerRuntime;

				// Upload promises wait for their attach ops to be acked. Inspect serialized pending state
				// to wait for each real upload to queue its attach op without connecting or stubbing storage.
				const waitForPendingBlobs = async (count: number): Promise<string[]> =>
					timeoutAwait(
						(async () => {
							while (!container.closed) {
								const state = (await runtime.getPendingLocalState()) as IPendingRuntimeState;
								const types =
									state.pending?.pendingStates.map(
										(message) => (JSON.parse(message.content) as { type: string }).type,
									) ?? [];
								if (
									types.filter((type) => type === ContainerMessageType.BlobAttach).length ===
									count
								) {
									return types;
								}
								await new Promise<void>((resolve) => setImmediate(resolve));
							}
							assert.fail("Container closed before the blob attach ops were queued");
						})(),
						{ errorMsg: `Waiting for ${count} pending blob attach ops` },
					);

				const firstBlob = dataStore._runtime.uploadBlob(stringToBuffer("first blob", "utf8"));
				await waitForPendingBlobs(1);
				const secondBlob = dataStore._runtime.uploadBlob(
					stringToBuffer("second blob", "utf8"),
				);
				const pendingTypes = await waitForPendingBlobs(2);
				assert.deepEqual(
					pendingTypes,
					upgradeSchema
						? [
								ContainerMessageType.BlobAttach,
								ContainerMessageType.DocumentSchemaChange,
								ContainerMessageType.BlobAttach,
							]
						: [ContainerMessageType.BlobAttach, ContainerMessageType.BlobAttach],
					"The schema proposal must be queued between the two blob attach batches",
				);

				let closeError: string | undefined;
				container.on("closed", (error) => {
					closeError = error?.message;
				});
				container.connect();
				await waitForContainerConnection(container);
				await provider.ensureSynchronized();
				assert(
					!container.closed,
					`Replaying blob batches must not close the container: ${closeError}`,
				);

				const handles = await Promise.all([firstBlob, secondBlob]);
				for (const [index, handle] of handles.entries()) {
					dataStore._root.set(`blob-${index}`, handle);
				}
				await provider.ensureSynchronized();

				const reader = await provider.loadTestContainer(loadConfig);
				const readerDataStore = (await reader.getEntryPoint()) as ITestDataObject;
				await provider.ensureSynchronized();
				for (const [index, expected] of ["first blob", "second blob"].entries()) {
					const handle = readerDataStore._root.get<IFluidHandle<ArrayBufferLike>>(
						`blob-${index}`,
					);
					assert(handle !== undefined, "The remote client must receive the blob handle");
					assert.equal(bufferToString(await handle.get(), "utf8"), expected);
				}
			});
		}
	},
);
