/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ISummarizer } from "@fluidframework/container-runtime/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { defaultGCConfig } from "./gcTestConfigs.js";

/**
 * Validates that the 'unreferenced' property in the summary tree of unreferenced data stores is present
 * as expected in the snapshot downloaded from server. Basically, the 'unreferenced' property is preserved
 * across summary upload and download.
 */
describeCompat(
	"GC unreferenced flag in downloaded snapshot",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		let mainContainer: IContainer;
		let mainDataStore: ITestDataObject;

		/**
		 * Validates that the unreferenced flag for data stores is correct in the summary that is uploaded to the server.
		 * Also, downloads this snapshot from the server and validates that the unreferenced flag is correct in it too.
		 * @param summarySequenceNumber - The sequence number when the summary was uploaded by the client.
		 * @param unreferencedDataStoreIds - The ids of data stores that should be marked as unreferenced.
		 * @param summaryVersion - The version of the summary that got uploaded to be used to download it from the server.
		 */
		async function summarizeAndValidateUnreferencedFlag(
			summarizer: ISummarizer,
			unreferencedDataStoreIds: string[],
		) {
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer);

			// Validate the summary uploaded to the server
			const dataStoreTreesUploaded = (
				summaryResult.summaryTree.tree[channelsTreeName] as ISummaryTree
			).tree;
			for (const [key, value] of Object.entries(dataStoreTreesUploaded)) {
				// The data store's summary will be a handle if it did not change since last summary. If so, ignore it.
				if (value.type === SummaryType.Tree) {
					if (unreferencedDataStoreIds.includes(key)) {
						assert(
							value.unreferenced,
							`Data store ${key} should be marked as unreferenced in summary`,
						);
					} else {
						assert(
							value.unreferenced === undefined,
							`Data store ${key} should not be marked as unreferenced in summary`,
						);
					}
				}
			}
			const documentSerivce = await provider.documentServiceFactory.createDocumentService(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				mainContainer.resolvedUrl!,
				provider.logger,
			);
			const documentStorage: IDocumentStorageService =
				await documentSerivce.connectToStorage();
			// Validate the snapshot downloaded from the server.
			// Download the snapshot corresponding to the above summary from the server.
			const versions = await documentStorage.getVersions(summaryResult.summaryVersion, 1);
			const snapshot = await documentStorage.getSnapshotTree(versions[0]);
			assert(snapshot !== null, "Snapshot could not be downloaded from server");
			const dataStoreTreesDownloaded =
				snapshot.trees[channelsTreeName]?.trees ?? snapshot.trees;
			for (const [key, value] of Object.entries(dataStoreTreesDownloaded)) {
				if (unreferencedDataStoreIds.includes(key)) {
					assert(
						value.unreferenced,
						`Data store ${key} should be marked as unreferenced in snapshot`,
					);
				} else {
					assert(
						value.unreferenced === undefined,
						`Data store ${key} should not be marked as unreferenced in snapshot`,
					);
				}
			}
		}

		beforeEach("setup", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			// Currently, only ODSP returns back the "unreferenced" flag in the snapshot. Once we add this to other
			// servers, we should enable these tests for them too.
			if (provider.driver.type !== "odsp") {
				this.skip();
			}

			mainContainer = await provider.makeTestContainer(defaultGCConfig);
			mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);
		});

		async function createNewDataStore() {
			const newDataStore =
				await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
			return (await newDataStore.entryPoint.get()) as ITestDataObject;
		}

		it("should return the unreferenced flag correctly in snapshot for deleted data stores", async () => {
			const deletedDataStoreIds: string[] = [];
			const { summarizer } = await createSummarizer(provider, mainContainer);

			// Create couple of data stores.
			const dataStore2 = await createNewDataStore();
			const dataStore3 = await createNewDataStore();

			// Add the handles of the above dataStores to mark them as referenced.
			mainDataStore._root.set("dataStore2", dataStore2.handle);
			mainDataStore._root.set("dataStore3", dataStore3.handle);

			// Wait for the summary that contains the above. Also, get this summary's version so that we can download
			// it from the server.
			await summarizeAndValidateUnreferencedFlag(summarizer, deletedDataStoreIds);

			// Remove one of the data store handle to mark it as unreferenced.
			mainDataStore._root.delete("dataStore2");
			deletedDataStoreIds.push(dataStore2._context.id);

			// Wait for the summary that contains the above. Also, get this summary's version so that we can download
			// it from the server.
			await summarizeAndValidateUnreferencedFlag(summarizer, deletedDataStoreIds);

			// Remove the other data store handle so that both data stores are marked as unreferenced.
			mainDataStore._root.delete("dataStore3");
			deletedDataStoreIds.push(dataStore3._context.id);

			// Wait for the summary that contains the above. Also, get this summary's version so that we can load
			// a new container with it.
			await summarizeAndValidateUnreferencedFlag(summarizer, deletedDataStoreIds);
		});

		it("should return the unreferenced flag correctly in snapshot for revived data stores", async () => {
			let deletedDataStoreIds: string[] = [];
			const { summarizer } = await createSummarizer(provider, mainContainer);

			// Create couple of data stores.
			const dataStore2 = await createNewDataStore();
			const dataStore3 = await createNewDataStore();

			// Add the handles of the above dataStores to mark them as referenced.
			mainDataStore._root.set("dataStore2", dataStore2.handle);
			mainDataStore._root.set("dataStore3", dataStore3.handle);

			// Wait for the summary that contains the above. Also, get this summary's version so that we can download
			// it from the server.
			await summarizeAndValidateUnreferencedFlag(summarizer, deletedDataStoreIds);

			// Remove the handles of the data stores to mark them as unreferenced.
			mainDataStore._root.delete("dataStore2");
			mainDataStore._root.delete("dataStore3");
			deletedDataStoreIds.push(dataStore2._context.id);
			deletedDataStoreIds.push(dataStore3._context.id);

			// Wait for the summary that contains the above. Also, get this summary's version so that we can download
			// it from the server.
			await summarizeAndValidateUnreferencedFlag(summarizer, deletedDataStoreIds);

			// Add the handles of the data stores back to mark them as referenced again.
			mainDataStore._root.set("dataStore2", dataStore2.handle);
			mainDataStore._root.set("dataStore3", dataStore3.handle);
			deletedDataStoreIds = [];

			// Wait for the summary that contains the above. Also, get this summary's version so that we can load
			// a new container with it.
			await summarizeAndValidateUnreferencedFlag(summarizer, deletedDataStoreIds);
		});
	},
);
