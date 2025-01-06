/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import {
	ISummaryTree,
	SummaryType,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * Validates the state of the given node in the GC summary tree:
 *
 * - If referenced = true, it should exist in the summary and should not have unreferenced timestamp.
 *
 * - If referenced = false and deletedFromGCState = false, it should exist in the summary and should have
 * unreferenced timestamp.
 *
 * - If referenced = false and deletedFromGCState = true, it should not exist in the summary.
 */
async function validateNodeStateInGCSummaryTree(
	provider: ITestObjectProvider,
	summarizerContainerRuntime: ContainerRuntime,
	nodeId: string,
	referenced: boolean,
	deletedFromGCState = false,
) {
	await provider.ensureSynchronized();
	const { summary } = await summarizerContainerRuntime.summarize({
		runGC: true,
		fullTree: true,
		trackState: false,
		summaryLogger: createChildLogger(),
	});

	const gcState = getGCStateFromSummary(summary);
	assert(gcState !== undefined, "GC tree is not available in the summary");

	let nodeFound = false;
	for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
		// Blob node path format - "/_blobs/<blobId>"
		// Data store node path format - "/<dataStoreId>/..."
		const pathParts = nodePath.split("/");
		const actualNodeId = pathParts[1] === "_blobs" ? pathParts[2] : pathParts[1];
		if (actualNodeId === nodeId) {
			if (referenced) {
				assert(
					nodeData.unreferencedTimestampMs === undefined,
					`Node ${nodeId} is referenced and should not have unreferenced timestamp`,
				);
			} else {
				assert(
					nodeData.unreferencedTimestampMs !== undefined,
					`Node ${nodeId} is unreferenced and should have unreferenced timestamp`,
				);
			}
			nodeFound = true;
			break;
		}
	}

	// If deletedFromGCState is true, the GC summary should not have the given node's entry. Else, it should.
	if (deletedFromGCState) {
		assert(
			!nodeFound,
			`Entry for ${nodeId} should not exist in the GC summary tree as its deleted.`,
		);
	} else {
		assert(nodeFound, `Entry for ${nodeId} not found in the GC summary tree.`);
	}
	return summary;
}

/**
 * Validates that the summary trees of children have the given reference state.
 */
function validateChildReferenceStates(summary: ISummaryTree, referenced: boolean) {
	const expectedUnreferenced = referenced ? undefined : true;
	for (const [id, summaryObject] of Object.entries(summary.tree)) {
		if (summaryObject.type !== SummaryType.Tree) {
			continue;
		}
		assert(
			summaryObject.unreferenced === expectedUnreferenced,
			`Summary tree ${id} should be ${referenced ? "referenced" : "unreferenced"}`,
		);
		validateChildReferenceStates(summaryObject, referenced);
	}
}

/**
 * Validates that the request to load the data store with the given id succeeds / fail as expected.
 * For referenced data stores, we should always be able to load them.
 * For unreferenced data store:
 *
 * - If deleteContent is true, the load should fail with 404 because the data store is deleted.
 *
 * - Otherwise, the load should pass because the data store exists.
 */
async function validateDataStoreLoad(
	summarizerContainerRuntime: ContainerRuntime,
	deleteContent: boolean,
	dataStoreId: string,
	referenced: boolean,
) {
	const response = await summarizerContainerRuntime.resolveHandle({
		url: `/${dataStoreId}`,
		headers: { wait: false },
	});
	// If deleteContent is true, unreferenced data stores are deleted after GC runs. So, we should
	// get a 404 response. Otherwise, we should get a 200.
	const expectedStatus = deleteContent && !referenced ? 404 : 200;
	assert(
		response.status === expectedStatus,
		`Data store ${dataStoreId} ${referenced ? "should" : "should not"} have loaded`,
	);
}

/**
 * Validates the data store referenced state in the GC summary tree and in the data store's summary tree.
 */
async function validateDataStoreReferenceState(
	provider: ITestObjectProvider,
	summarizerContainerRuntime: ContainerRuntime,
	deleteContent: boolean,
	dataStoreId: string,
	referenced: boolean,
	deletedFromGCState = false,
) {
	const summary = await validateNodeStateInGCSummaryTree(
		provider,
		summarizerContainerRuntime,
		dataStoreId,
		referenced,
		deletedFromGCState,
	);
	await validateDataStoreLoad(
		summarizerContainerRuntime,
		deleteContent,
		dataStoreId,
		referenced,
	);

	let dataStoreTree: ISummaryTree | undefined;
	const channelsTree = (summary.tree[channelsTreeName] as ISummaryTree).tree;
	for (const [id, summaryObject] of Object.entries(channelsTree)) {
		if (id === dataStoreId) {
			assert(
				summaryObject.type === SummaryType.Tree,
				`Data store ${dataStoreId}'s entry is not a tree`,
			);
			dataStoreTree = summaryObject;
			break;
		}
	}

	// If deleteContent is true, unreferenced data stores are deleted in each summary. So,
	// the summary should not contain the data store entry.
	if (deleteContent && !referenced) {
		assert(
			dataStoreTree === undefined,
			`Data store ${dataStoreId} should not be in the summary!`,
		);
	} else {
		// For referenced data store, the unreferenced flag in its summary tree is undefined.
		const expectedUnreferenced = referenced ? undefined : true;
		assert(dataStoreTree !== undefined, `Data store ${dataStoreId} is not in the summary!`);
		assert(
			dataStoreTree.unreferenced === expectedUnreferenced,
			`Data store ${dataStoreId} should be ${referenced ? "referenced" : "unreferenced"}`,
		);

		// Validate that the summary trees of its children are marked as referenced. Currently, GC only runs
		// at data store layer so everything below that layer is marked as referenced.
		validateChildReferenceStates(dataStoreTree, true /* referenced */);
	}
}

/**
 * Validates that when running in GC test mode, unreferenced content is deleted from the summary.
 */
describeCompat("GC delete objects in test mode", "FullCompat", (getTestObjectProvider) => {
	// If deleteContent is true, GC is run in test mode where content that is not referenced is
	// deleted after each GC run.
	const tests = (deleteContent: boolean = false) => {
		let provider: ITestObjectProvider;
		let summarizerContainerRuntime: ContainerRuntime;
		let mainDataStore: ITestDataObject;

		beforeEach("setup", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "local") {
				this.skip();
			}
			const testContainerConfig: ITestContainerConfig = {
				...defaultGCConfig,
				runtimeOptions: {
					...defaultGCConfig.runtimeOptions,
					gcOptions: {
						runGCInTestMode: deleteContent,
					},
				},
			};
			const container = await provider.makeTestContainer(testContainerConfig);
			mainDataStore = await getContainerEntryPointBackCompat<ITestDataObject>(container);

			// Send an op before GC runs. GC needs current timestamp to work with which is retrieved from ops. Without
			// any op, GC will not run.
			mainDataStore._root.set("key", "value");
			await waitForContainerConnection(container);

			const summarizerContainer = await provider.loadTestContainer(testContainerConfig);
			const summarizerMainDataStore =
				await getContainerEntryPointBackCompat<ITestDataObject>(summarizerContainer);
			summarizerContainerRuntime = summarizerMainDataStore._context
				.containerRuntime as ContainerRuntime;
		});

		it("marks default data store as referenced", async () => {
			await validateDataStoreReferenceState(
				provider,
				summarizerContainerRuntime,
				deleteContent,
				mainDataStore._context.id,
				true /* referenced */,
			);
		});

		it("marks non-root data stores as referenced / unreferenced correctly", async () => {
			const dataStore =
				await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
			const dataObject = await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore);
			// Add data store's handle in root component and verify its marked as referenced.
			mainDataStore._root.set("nonRootDS", dataObject.handle);
			await validateDataStoreReferenceState(
				provider,
				summarizerContainerRuntime,
				deleteContent,
				dataObject._context.id,
				true /* referenced */,
			);

			// Remove its handle and verify its marked as unreferenced.
			mainDataStore._root.delete("nonRootDS");
			await validateDataStoreReferenceState(
				provider,
				summarizerContainerRuntime,
				deleteContent,
				dataObject._context.id,
				false /* referenced */,
			);

			// Add data store's handle back in root component. If deleteContent is true, the data store
			// should get deleted and should remain unreferenced. Otherwise, it should be referenced back.
			// Also, if deleteContent is true, it won't be in the GC state in the summary anymore.
			mainDataStore._root.set("nonRootDS", dataObject.handle);
			await validateDataStoreReferenceState(
				provider,
				summarizerContainerRuntime,
				deleteContent,
				dataObject._context.id,
				deleteContent ? false : true /* referenced */,
				deleteContent ? true : false /* deletedFromGCState */,
			);
		});

		it("marks non-root data stores with handle in unreferenced data stores as unreferenced", async () => {
			// Create a non-root data store - dataStore1.
			const dataStore1 =
				await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
			const dataObject1 = await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore1);
			// Add dataStore1's handle in root component and verify its marked as referenced.
			mainDataStore._root.set("nonRootDS1", dataObject1.handle);
			await validateDataStoreReferenceState(
				provider,
				summarizerContainerRuntime,
				deleteContent,
				dataObject1._context.id,
				true /* referenced */,
			);

			// Create another non-root data store - dataStore2.
			const dataStore2 =
				await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
			const dataObject2 = await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore2);
			// Add dataStore2's handle in dataStore1 and verify its marked as referenced.
			dataObject1._root.set("nonRootDS2", dataObject2.handle);
			await validateDataStoreReferenceState(
				provider,
				summarizerContainerRuntime,
				deleteContent,
				dataObject2._context.id,
				true /* referenced */,
			);

			// Remove dataStore1's handle. This should mark dataStore1 as unreferenced which in turn should mark
			// dataStore2 as unreferenced.
			mainDataStore._root.delete("nonRootDS1");
			await validateDataStoreReferenceState(
				provider,
				summarizerContainerRuntime,
				deleteContent,
				dataObject2._context.id,
				false /* referenced */,
			);
		});
	};

	describe("Verify node state when unreferenced content is marked", () => {
		tests();
	});

	describe("Verify node state when unreferenced content is deleted", () => {
		tests(true /* deleteContent */);
	});
});

/**
 * Validates the reference state of the attachment blob with the given handle in the GC summary tree and in
 * the blob summary tree.
 */
async function validateBlobsReferenceState(
	provider: ITestObjectProvider,
	summarizerContainerRuntime: ContainerRuntime,
	deleteContent: boolean,
	blobHandle: IFluidHandleInternal<ArrayBufferLike>,
	referenced: boolean,
	deletedFromGCState = false,
) {
	const blobId = blobHandle.absolutePath.split("/")[2];
	const summary = await validateNodeStateInGCSummaryTree(
		provider,
		summarizerContainerRuntime,
		blobId,
		referenced,
		deletedFromGCState,
	);

	const blobsTree = (summary.tree[".blobs"] as ISummaryTree).tree;
	let blobFound = false;
	for (const [key, attachment] of Object.entries(blobsTree)) {
		assert(
			attachment.type === SummaryType.Attachment || key === ".redirectTable",
			"blob tree should only contain attachment blobs",
		);
		if (attachment.type === SummaryType.Attachment && attachment.id === blobId) {
			blobFound = true;
		}
	}

	if (!blobFound) {
		const redirectTable: SummaryObject | undefined = blobsTree[".redirectTable"];
		assert(redirectTable.type === SummaryType.Blob);
		assert(typeof redirectTable.content === "string");
		blobFound = redirectTable.content.indexOf(blobId) > 0;
	}

	// If deleteContent is true, unreferenced blob ids are deleted in each summary. So,
	// the summary should not contain the blob id.
	if (referenced || !deleteContent) {
		assert(blobFound, `Blob with id ${blobId} should be in blob summary tree`);
	} else {
		assert(!blobFound, `Blob with id ${blobId} should not be in blob summary tree`);
	}
}

/**
 * Validates that when running in GC test mode, unreferenced content is deleted from the summary.
 */
describeCompat(
	"GC delete attachment blobs in test mode",
	"NoCompat",
	(getTestObjectProvider) => {
		// If deleteContent is true, GC is run in test mode where content that is not referenced is
		// deleted after each GC run.
		const tests = (deleteContent: boolean = false) => {
			let provider: ITestObjectProvider;
			let summarizerContainerRuntime: ContainerRuntime;
			let mainDataStore: ITestDataObject;

			beforeEach("setup", async function () {
				provider = getTestObjectProvider({ syncSummarizer: true });
				if (provider.driver.type !== "local") {
					this.skip();
				}
				const testContainerConfig: ITestContainerConfig = {
					...defaultGCConfig,
					runtimeOptions: {
						...defaultGCConfig.runtimeOptions,
						gcOptions: {
							runGCInTestMode: deleteContent,
						},
					},
				};
				const container = await provider.makeTestContainer(testContainerConfig);
				mainDataStore = (await container.getEntryPoint()) as ITestDataObject;
				summarizerContainerRuntime = mainDataStore._context
					.containerRuntime as ContainerRuntime;
				await waitForContainerConnection(container);
			});

			it("marks attachment blobs as referenced / unreferenced correctly", async () => {
				// Upload couple of attachment blobs and mark them referenced.
				const blob1Contents = "Blob contents 1";
				const blob2Contents = "Blob contents 2";
				const blob1Handle = await mainDataStore._context.uploadBlob(
					stringToBuffer(blob1Contents, "utf-8"),
				);
				const blob2Handle = await mainDataStore._context.uploadBlob(
					stringToBuffer(blob2Contents, "utf-8"),
				);
				mainDataStore._root.set("blob1", blob1Handle);
				mainDataStore._root.set("blob2", blob2Handle);
				await validateBlobsReferenceState(
					provider,
					summarizerContainerRuntime,
					deleteContent,
					blob1Handle,
					true /* referenced */,
				);
				await validateBlobsReferenceState(
					provider,
					summarizerContainerRuntime,
					deleteContent,
					blob2Handle,
					true /* referenced */,
				);

				// Remove blob1's handle and verify its marked as unreferenced.
				mainDataStore._root.delete("blob1");
				await validateBlobsReferenceState(
					provider,
					summarizerContainerRuntime,
					deleteContent,
					blob1Handle,
					false /* referenced */,
				);

				// Add blob1's handle back. If deleteContent is true, the blob should get deleted and should
				// remain unreferenced. Otherwise, it should be referenced back.
				// Also, if deleteContent is true, it won't be in the GC state in the summary anymore.
				mainDataStore._root.set("blob1", blob1Handle);
				await validateBlobsReferenceState(
					provider,
					summarizerContainerRuntime,
					deleteContent,
					blob1Handle,
					deleteContent ? false : true /* referenced */,
					deleteContent ? true : false /* deletedFromGCState */,
				);
			});
		};

		describe("Verify attachment blob state when unreferenced content is marked", () => {
			tests();
		});

		describe("Verify attachment blob state when unreferenced content is deleted", () => {
			tests(true /* deleteContent */);
		});
	},
);
