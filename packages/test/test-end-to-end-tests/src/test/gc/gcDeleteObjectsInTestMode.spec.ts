/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { assert, TelemetryNullLogger } from "@fluidframework/common-utils";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { TestDataObject } from "./mockSummarizerClient";

/**
 * Validates that when running in GC test mode, unreferenced content is deleted from the summary.
 */
describeFullCompat("GC delete objects in test mode", (getTestObjectProvider) => {
    // If deleteUnreferencedContent is true, GC is run in test mode where content that is not referenced is
    // deleted after each GC run.
    const tests = (deleteUnreferencedContent: boolean = false) => {
        const dataObjectFactory = new DataObjectFactory(
            "TestDataObject",
            TestDataObject,
            [],
            []);
        const runtimeOptions: IContainerRuntimeOptions = {
            summaryOptions: { disableSummaries: true },
            gcOptions: { gcAllowed: true, runGCInTestMode: deleteUnreferencedContent },
        };
        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            undefined,
            runtimeOptions,
        );

        let provider: ITestObjectProvider;
        let containerRuntime: ContainerRuntime;
        let defaultDataStore: TestDataObject;

        const createContainer = async () => provider.createContainer(runtimeFactory);

        /**
         * Validates that the summary trees of children have the given reference state.
         */
        function validateChildReferenceStates(summary: ISummaryTree, referenced: boolean) {
            const expectedUnreferenced = referenced ? undefined : true;
            for (const [ id, summaryObject ] of Object.entries(summary.tree)) {
                if (summaryObject.type !== SummaryType.Tree) {
                    continue;
                }
                assert(
                    summaryObject.unreferenced === expectedUnreferenced,
                    `Summary tree ${id} should be ${ referenced ? "referenced" : "unreferenced" }`,
                );
                validateChildReferenceStates(summaryObject, referenced);
            }
        }

        /**
         * Validates that the data store with the given id is represented correctly in the summary.
         * For referenced data stores:
         *   - The unreferenced property in its entry in the summary should be undefined.
         * For unreferenced data stores:
         *   - If deleteUnreferencedContent is true, its entry should not be in the summary.
         *   - Otherwise, he unreferenced property in its entry in the summary should be true.
         */
        function validateDataStoreInSummary(summary: ISummaryTree, dataStoreId: string, referenced: boolean) {
            let dataStoreTree: ISummaryTree | undefined;
            const channelsTree = (summary.tree[".channels"] as ISummaryTree)?.tree ?? summary.tree;
            for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
                if (id === dataStoreId) {
                    assert(
                        summaryObject.type === SummaryType.Tree,
                        `Data store ${dataStoreId}'s entry is not a tree`,
                    );
                    dataStoreTree = summaryObject;
                    break;
                }
            }

            // If deleteUnreferencedContent is true, unreferenced data stores are deleted in each summary. So,
            // the summary should not contain the data store entry.
            if (deleteUnreferencedContent && !referenced) {
                assert(dataStoreTree === undefined, `Data store ${dataStoreId} should not be in the summary!`);
            } else {
                // For referenced data store, the unreferenced flag in its summary tree is undefined.
                const expectedUnreferenced = referenced ? undefined : true;
                assert(dataStoreTree !== undefined, `Data store ${dataStoreId} is not in the summary!`);
                assert(
                    dataStoreTree.unreferenced === expectedUnreferenced,
                    `Data store ${dataStoreId} should be ${ referenced ? "referenced" : "unreferenced" }`,
                );

                // Validate that the summary trees of its children are marked as referenced. Currently, GC only runs
                // at data store layer so everything below that layer is marked as referenced.
                validateChildReferenceStates(dataStoreTree, true /* referenced */);
            }
        }

        /**
         * Validates that the request to load the data store with the given id succeeds / fail as expected.
         * For referenced data stores, we should always be able to load them.
         * For unreferenced data store:
         *   - If deleteUnreferencedContent is true, the load should fail with 404 because the data store is deleted.
         *   - Otherwise, the load should pass because the data store exists.
         */
        async function validateDataStoreLoad(dataStoreId: string, referenced: boolean) {
            const response = await containerRuntime.resolveHandle({
                url: `/${dataStoreId}`, headers: { wait: false },
            });
            // If deleteUnreferencedContent is true, unreferenced data stores are deleted after GC runs. So, we should
            // get a 404 response. Otherwise, we should get a 200.
            const expectedStatus = deleteUnreferencedContent && !referenced ? 404 : 200;
            assert(
                response.status === expectedStatus,
                `Data store ${dataStoreId} ${ referenced ? "should" : "should not" } have loaded`,
            );
        }

        /**
         * Summarizes the container and validates that the data store with the given id is correctly represented in
         * the summary. Also validates that the data store load succeeds / fails as expected.
         */
        async function validateDataStoreReferenceState(dataStoreId: string, referenced: boolean) {
            await provider.ensureSynchronized();
            const { summary } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
                summaryLogger: new TelemetryNullLogger(),
            });

            await validateDataStoreLoad(dataStoreId, referenced);
            validateDataStoreInSummary(summary, dataStoreId, referenced);
        }

        beforeEach(async () => {
            provider = getTestObjectProvider();
            const container = await createContainer() as Container;
            defaultDataStore = await requestFluidObject<TestDataObject>(container, "/");
            containerRuntime = defaultDataStore.containerRuntime;
        });

        it("marks default data store as referenced", async () => {
            await validateDataStoreReferenceState(defaultDataStore.id, true /* referenced */);
        });

        it("marks root data stores as referenced", async () => {
            const rootDataStore = await dataObjectFactory.createRootInstance("rootDataStore", containerRuntime);
            await validateDataStoreReferenceState(rootDataStore.id, true /* referenced */);
        });

        it("marks non-root data stores as referenced / unreferenced correctly", async () => {
            const dataStore = await dataObjectFactory.createInstance(containerRuntime);
            // Add data store's handle in root component and verify its marked as referenced.
            {
                defaultDataStore._root.set("nonRootDS", dataStore.handle);
                await validateDataStoreReferenceState(dataStore.id, true /* referenced */);
            }

            // Remove its handle and verify its marked as unreferenced.
            {
                defaultDataStore._root.delete("nonRootDS");
                await validateDataStoreReferenceState(dataStore.id, false /* referenced */);
            }

            // Add data store's handle back in root component. If deleteUnreferencedContent is true, the data store
            // should get deleted and should remain unreferenced. Otherwise, it should be referenced back.
            {
                defaultDataStore._root.set("nonRootDS", dataStore.handle);
                await validateDataStoreReferenceState(
                    dataStore.id, deleteUnreferencedContent ? false : true /* referenced */);
            }
        });

        it("marks non-root data stores with handle in unreferenced data stores as unreferenced", async () => {
            // Create a non-root data store - dataStore1.
            const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
            // Add dataStore1's handle in root component and verify its marked as referenced.
            {
                defaultDataStore._root.set("nonRootDS1", dataStore1.handle);
                await validateDataStoreReferenceState(dataStore1.id, true /* referenced */);
            }

            // Remove dataStore1's handle and verify its marked as unreferenced.
            {
                defaultDataStore._root.delete("nonRootDS1");
                await validateDataStoreReferenceState(dataStore1.id, false /* referenced */);
            }

            // Create another non-root data store - dataStore2.
            const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);
            // Add dataStore2's handle in root component and verify its marked as referenced.
            {
                defaultDataStore._root.set("nonRootDS2", dataStore2.handle);
                await validateDataStoreReferenceState(dataStore2.id, true /* referenced */);
            }

            // Remove dataStore2's handle from root component and add to dataStore1 (which is unreferenced).
            {
                defaultDataStore._root.delete("nonRootDS2");
                dataStore1._root.set("nonRootDS2", dataStore2.handle);
                await validateDataStoreReferenceState(dataStore2.id, false /* referenced */);
            }
        });
    };

    describe("Verify data store state when unreferenced content is marked", () => {
        tests();
    });

    describe("Verify data store state when unreferenced content is deleted", () => {
        tests(true /* deleteUnreferencedContent */);
    });
});
