/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { ITestDataObject, describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
// eslint-disable-next-line import/no-internal-modules
import { blobManagerBasePath } from "@fluidframework/container-runtime/internal/test/blobManager";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import {
	driverSupportsBlobs,
	getUrlFromDetachedBlobStorage,
} from "../mockDetachedBlobStorage.js";

import {
	getGCStateFromSummary,
	waitForContainerWriteModeConnectionWrite,
} from "./gcTestSummaryUtils.js";

/**
 * Validates that unreferenced blobs are marked as unreferenced and deleted correctly.
 */
describeCompat("Garbage collection of blobs", "NoCompat", (getTestObjectProvider) => {
	// If deleteUnreferencedContent is true, GC is run in test mode where content that is not referenced is
	// deleted after each GC run.
	const tests = (deleteUnreferencedContent: boolean = false) => {
		const gcContainerConfig: ITestContainerConfig = {
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
				gcOptions: {
					runGCInTestMode: deleteUnreferencedContent,
				},
			},
		};

		let provider: ITestObjectProvider;
		let container: IContainer;
		let defaultDataStore: ITestDataObject;

		/**
		 * Summarizes and returns the referenced / unreferenced state of each blob node if the GC state in summary.
		 */
		async function summarizeAndGetUnreferencedNodeStates(summarizerRuntime: ContainerRuntime) {
			await provider.ensureSynchronized();
			const { summary } = await summarizerRuntime.summarize({
				runGC: true,
				fullTree: true,
			});

			const gcState = getGCStateFromSummary(summary);
			assert(gcState !== undefined, "GC tree is not available in the summary");

			const nodeTimestamps: Map<string, "referenced" | "unreferenced"> = new Map();
			for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
				// Filter blob nodes.
				if (nodePath.slice(1).startsWith(blobManagerBasePath)) {
					// Unreferenced nodes have unreferenced timestamp associated with them.
					nodeTimestamps.set(
						nodePath,
						nodeData.unreferencedTimestampMs ? "unreferenced" : "referenced",
					);
				}
			}
			return nodeTimestamps;
		}

		/**
		 * Loads a container from the itemId of the container. We need to do this instead of loading a container
		 * normally because - When a detached container is attached after attachment blobs have been added, a .tmp
		 * extension is added to the end of the filename. Since the ODSP test driver assumes the filename will always
		 * be <fileName>.fluid, it does not correctly return the url for a container that was attached with attachment
		 * blobs when createContainerUrl() is called, instead creating a new file.
		 */
		async function loadContainer() {
			const url = await getUrlFromDetachedBlobStorage(container, provider);
			const newContainer = await provider.makeTestLoader(gcContainerConfig).resolve({ url });
			await waitForContainerConnection(newContainer);
			return newContainer;
		}

		async function createSummarizerRuntime() {
			const summarizerContainer = await loadContainer();
			const summarizerDefaultDataStore =
				(await summarizerContainer.getEntryPoint()) as ITestDataObject;
			return summarizerDefaultDataStore._context.containerRuntime as ContainerRuntime;
		}

		beforeEach("setup", async function () {
			provider = getTestObjectProvider();
			// Skip these tests for drivers / services that do not support attachment blobs.
			if (!driverSupportsBlobs(provider.driver)) {
				this.skip();
			}
			const loader = provider.makeTestLoader({
				...gcContainerConfig,
			});
			container = await loader.createDetachedContainer(provider.defaultCodeDetails);
			defaultDataStore = (await container.getEntryPoint()) as ITestDataObject;
		});

		it("collects blobs uploaded in attached container", async () => {
			// Attach the container.
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

			const summarizerRuntime = await createSummarizerRuntime();

			// Upload an attachment blob and mark it referenced by storing its handle in a DDS.
			const blobContents = "Blob contents";
			const blobHandle = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			defaultDataStore._root.set("blob", blobHandle);

			const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert(s1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

			// Remove the blob's handle and verify its marked as unreferenced.
			defaultDataStore._root.delete("blob");
			const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert(
				s2.get(blobHandle.absolutePath) === "unreferenced",
				"blob should be unreferenced",
			);

			// Add the blob's handle back. If deleteUnreferencedContent is true, the blob's node would have been
			// deleted from the GC state. Else, it would be referenced.
			defaultDataStore._root.set("blob", blobHandle);
			const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			if (deleteUnreferencedContent) {
				assert(
					s3.get(blobHandle.absolutePath) === undefined,
					"blob should not have a GC entry",
				);
			} else {
				assert(
					s3.get(blobHandle.absolutePath) === "referenced",
					"blob should be re-referenced",
				);
			}
		});

		it("collects blobs uploaded in detached container", async () => {
			// Upload an attachment blob and mark it referenced by storing its handle in a DDS.
			const blobContents = "Blob contents";
			const blobHandle = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			defaultDataStore._root.set("blob", blobHandle);

			// Attach the container after the blob is uploaded.
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

			const summarizerRuntime = await createSummarizerRuntime();

			// GC requires at least one op to have been processed. It needs a server timestamp and
			// uses the timestamp of the op.
			defaultDataStore._root.set("make container connect in", "write mode");

			// Load a second container.
			const container2 = await loadContainer();
			const defaultDataStore2 = (await container2.getEntryPoint()) as ITestDataObject;

			// Validate the blob handle's path is the same as the one in the first container.
			const blobHandle2 =
				defaultDataStore2._root.get<IFluidHandleInternal<ArrayBufferLike>>("blob");
			assert.strictEqual(
				blobHandle.absolutePath,
				blobHandle2?.absolutePath,
				"The blob handle has a different path in remote container.",
			);

			const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert(s1.get(blobHandle.absolutePath) === "referenced", "blob should be referenced");

			// Remove the blob's handle and verify its marked as unreferenced.
			defaultDataStore._root.delete("blob");
			const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert(
				s2.get(blobHandle.absolutePath) === "unreferenced",
				"blob should be unreferenced",
			);

			// Add the blob's handle in second container. If deleteUnreferencedContent is true, the blob's node would
			// have been deleted from the GC state. Else, it would be referenced.
			defaultDataStore2._root.set("blobContainer2", blobHandle2);
			const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			if (deleteUnreferencedContent) {
				assert(
					s3.get(blobHandle.absolutePath) === undefined,
					"blob should not have a GC entry",
				);
			} else {
				assert(
					s3.get(blobHandle.absolutePath) === "referenced",
					"blob should be re-referenced",
				);
			}
		});

		it("collects blobs uploaded in detached and de-duped in attached container", async () => {
			// Upload an attachment blob. We should get a handle with a localId for the blob. Mark it referenced by
			// storing its handle in a DDS.
			const blobContents = "Blob contents";
			const localHandle1 = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			defaultDataStore._root.set("local1", localHandle1);

			// Attach the container after the blob is uploaded.
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

			const summarizerRuntime = await createSummarizerRuntime();

			// GC requires at least one op to have been processed. It needs a server timestamp and
			// uses the timestamp of the op.
			defaultDataStore._root.set("make container connect in", "write mode");
			// Make sure we are connected or we may get a local ID handle
			await waitForContainerWriteModeConnectionWrite(container);

			// Upload the same blob. This will get de-duped and we will get back a handle with another localId. Both of
			// these blobs should be mapped to the same storageId.
			const localHandle2 = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			defaultDataStore._root.set("local2", localHandle2);

			// Validate that both the localId nodes are referenced.
			const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert.strictEqual(s1.size, 2, "There should be 2 blob entries in GC data");
			assert(
				s1.get(localHandle1.absolutePath) === "referenced",
				"local id 1 blob should be referenced",
			);
			assert(
				s1.get(localHandle2.absolutePath) === "referenced",
				"local id 2 blob should be referenced",
			);

			// Delete blob localId handles. This should make the localId nodes unreferenced.
			defaultDataStore._root.delete("local1");
			defaultDataStore._root.delete("local2");
			const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert(
				s2.get(localHandle1.absolutePath) === "unreferenced",
				"local id 1 blob should be unreferenced",
			);
			assert(
				s2.get(localHandle2.absolutePath) === "unreferenced",
				"local id 2 blob should be unreferenced",
			);

			// Add the localId1 handle back. If deleteUnreferencedContent is true, all the nodes would have been
			// deleted from the GC state. Else, localId1 would be referenced and localId2 unreferenced.
			defaultDataStore._root.set("local1", localHandle1);
			const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			if (deleteUnreferencedContent) {
				assert(
					s3.get(localHandle1.absolutePath) === undefined,
					"local id 1 blob should not have a GC entry",
				);
				assert(
					s3.get(localHandle2.absolutePath) === undefined,
					"local id 2 blob should not have a GC entry",
				);
			} else {
				assert(
					s3.get(localHandle1.absolutePath) === "referenced",
					"local id 1 blob should be re-referenced",
				);
				assert(
					s3.get(localHandle2.absolutePath) === "unreferenced",
					"local id 2 blob should still be unreferenced",
				);
			}
		});

		it("collects blobs uploaded and de-duped in detached container", async () => {
			// Upload couple of attachment blobs with the same content. When these blobs are uploaded to the server,
			// they will be de-duped and redirected to the same storageId.
			const blobContents = "Blob contents";
			const localHandle1 = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			const localHandle2 = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Attach the container after the blob is uploaded.
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));

			const summarizerRuntime = await createSummarizerRuntime();

			// GC requires at least one op to have been processed. It needs a server timestamp and
			// uses the timestamp of the op.
			defaultDataStore._root.set("make container connect in", "write mode");
			// Make sure we are connected or we may get a local ID handle
			await waitForContainerWriteModeConnectionWrite(container);

			// Upload the same blob. This will get de-duped and we will get back a handle with another localId. This and
			// the blobs uploaded in detached mode should map to the same storageId.
			const localHandle3 = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Validate that storing the localId handles makes them referenced.
			defaultDataStore._root.set("local1", localHandle1);
			defaultDataStore._root.set("local2", localHandle2);
			defaultDataStore._root.set("local3", localHandle3);
			const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert.strictEqual(s1.size, 3, "There should be 3 blob entries in GC data");
			assert(
				s1.get(localHandle1.absolutePath) === "referenced",
				"local id 1 blob should be referenced (1)",
			);
			assert(
				s1.get(localHandle2.absolutePath) === "referenced",
				"local id 2 blob should be referenced (1)",
			);
			assert(
				s1.get(localHandle3.absolutePath) === "referenced",
				"local id 3 blob should be referenced (1)",
			);

			// Delete the localId handles. This would make them unreferenced.
			defaultDataStore._root.delete("local1");
			defaultDataStore._root.delete("local2");
			defaultDataStore._root.delete("local3");
			const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert(
				s2.get(localHandle1.absolutePath) === "unreferenced",
				"local id 1 blob should be unreferenced",
			);
			assert(
				s2.get(localHandle2.absolutePath) === "unreferenced",
				"local id 2 blob should be unreferenced",
			);
			assert(
				s2.get(localHandle3.absolutePath) === "unreferenced",
				"local id 3 blob should be unreferenced",
			);

			// Add the localId1 handle back. If deleteUnreferencedContent is true, all the nodes would have been
			// deleted from the GC state. Else, localId1 node will be referenced and others unreferenced.
			defaultDataStore._root.set("local1", localHandle1);
			const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			if (deleteUnreferencedContent) {
				assert(
					s3.get(localHandle1.absolutePath) === undefined,
					"local id 1 blob should not have a GC entry",
				);
				assert(
					s3.get(localHandle2.absolutePath) === undefined,
					"local id 2 blob should not have a GC entry",
				);
				assert(
					s3.get(localHandle3.absolutePath) === undefined,
					"local id 3 blob should not have a GC entry",
				);
			} else {
				assert(
					s3.get(localHandle1.absolutePath) === "referenced",
					"local id 1 blob should be re-referenced",
				);
				assert(
					s3.get(localHandle2.absolutePath) === "unreferenced",
					"local id 2 blob should still be unreferenced",
				);
				assert(
					s3.get(localHandle3.absolutePath) === "unreferenced",
					"local id 3 blob should still be unreferenced",
				);
			}
		});

		it("collects blobs uploaded in disconnected and de-duped in connected container", async () => {
			// Attach the main container.
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
			// GC requires at least one op to have been processed. It needs a server timestamp and
			// uses the timestamp of the op.
			defaultDataStore._root.set("make container connect in", "write mode");
			await waitForContainerWriteModeConnectionWrite(container);

			// Summarize once before uploading the blob in disconnected container. This will make sure that when GC
			// runs next, it has GC data from previous run to do reference validation.
			const summarizerRuntime = await createSummarizerRuntime();
			await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);

			// Load a new container and disconnect it.
			const container2 = await loadContainer();
			const container2DataStore = (await container2.getEntryPoint()) as ITestDataObject;
			container2.disconnect();

			// Upload an attachment blob when disconnected. We should get a handle with a localId for the blob. Mark it
			// referenced by storing its handle in a DDS.
			const blobContents = "Blob contents";
			const localHandle1P = container2DataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Connect the container and wait for it to be connected.
			container2.connect();
			await waitForContainerConnection(container2);
			const localHandle1 = await localHandle1P;
			container2DataStore._root.set("local1", localHandle1);
			// Validate that the localId node is referenced.
			const s1 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert.strictEqual(s1.size, 1, "There should be 1 blob entries in GC data");
			assert(
				s1.get(localHandle1.absolutePath) === "referenced",
				"local id blob should be referenced",
			);

			// Upload the same blob. This will get de-duped and we will get back a handle with another localId. This and
			// the blob uploaded in disconnected mode should map to the same storageId.
			const localHandle2 = await defaultDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Add the localId2 handle and remove the localId1 handle. Validate that localId2 nodes is
			// referenced and localId1 node is unreferenced.
			defaultDataStore._root.set("local2", localHandle2);
			defaultDataStore._root.delete("local1");
			const s2 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			assert(
				s2.get(localHandle1.absolutePath) === "unreferenced",
				"local id 1 blob should be unreferenced",
			);
			assert(
				s2.get(localHandle2.absolutePath) === "referenced",
				"local id 2 blob should be referenced",
			);

			// Remove the localId2 handle. Validate that localId2 node is now unreferenced as well. Also, if
			// deleteUnreferencedContent is true, localId1 node would have been deleted.
			defaultDataStore._root.delete("local2");
			const s3 = await summarizeAndGetUnreferencedNodeStates(summarizerRuntime);
			if (deleteUnreferencedContent) {
				assert(
					s3.get(localHandle1.absolutePath) === undefined,
					"local id 1 blob should not have a GC entry",
				);
			} else {
				assert(
					s3.get(localHandle1.absolutePath) === "unreferenced",
					"local id 1 blob should still be unreferenced",
				);
			}
			assert(
				s3.get(localHandle2.absolutePath) === "unreferenced",
				"local id 2 blob should still be unreferenced",
			);
		});
	};

	describe("Verify attachment blob state when unreferenced content is marked", () => {
		tests();
	});

	describe("Verify attachment blob state when unreferenced content is deleted", () => {
		tests(true /* deleteUnreferencedContent */);
	});
});
