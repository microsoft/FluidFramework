/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    FluidDataStoreRegistryEntry,
    NamedFluidDataStoreRegistryEntries,
    SummarizeInternalFn,
    CreateChildSummarizerNodeFn,
    CreateSummarizerNodeSource,
} from "@fluidframework/runtime-definitions";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SummaryTracker, SummarizerNode } from "@fluidframework/runtime-utils";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { LocalFluidDataStoreContext } from "../dataStoreContext";
import { ContainerRuntime } from "../containerRuntime";

describe("Data Store Creation Tests", () => {
    describe("Store creation via local context creation and realize", () => {
        /**
         * These tests simulate dataStore and subDataStore creation by creating local contexts and realizing them.
         * The dataStore tree for these tests is as follows:
         *
         *                  Default
         *                     |
         *                     |
         *                DataStore A
         *                   /   \
         *                  /     \
         *        DataStore B     DataStore C
         */

        let storage: IDocumentStorageService;
        let scope: IFluidObject;
        const attachCb = (mR: IFluidDataStoreChannel) => { };
        let containerRuntime: ContainerRuntime;
        const defaultName = "default";
        const dataStoreAName = "dataStoreA";
        const dataStoreBName = "dataStoreB";
        const dataStoreCName = "dataStoreC";
        let summaryTracker: SummaryTracker;
        let getCreateSummarizerNodeFn: (id: string) => CreateChildSummarizerNodeFn;

        // Helper function that creates a FluidDataStoreRegistryEntry with the registry entries
        // provided to it.
        function createDataStoreRegistryEntry(
            entries: NamedFluidDataStoreRegistryEntries,
        ): FluidDataStoreRegistryEntry {
            const registryEntries = new Map(entries);
            const factory: IFluidDataStoreFactory = {
                type: "store-type",
                get IFluidDataStoreFactory() { return factory; },
                instantiateDataStore: async (context: IFluidDataStoreContext) => new MockFluidDataStoreRuntime(),
            };
            const registry: IFluidDataStoreRegistry = {
                get IFluidDataStoreRegistry() { return registry; },
                // Returns the registry entry as per the entries provided in the param.
                get: async (pkg) => registryEntries.get(pkg),
            };

            const entry: FluidDataStoreRegistryEntry = {
                get IFluidDataStoreFactory() { return factory; },
                get IFluidDataStoreRegistry() { return registry; },
            };
            return entry;
        }

        beforeEach(async () => {
            // DataStore B is a leaf dataStore and its registry does not have any entries.
            const entryB = createDataStoreRegistryEntry([]);
            // DataStore C is a leaf dataStore and its registry does not have any entries.
            const entryC = createDataStoreRegistryEntry([]);
            // DataStore A's registry has entries for dataStore B and dataStore C.
            const entryA = createDataStoreRegistryEntry([
                [dataStoreBName, Promise.resolve(entryB)],
                [dataStoreCName, Promise.resolve(entryC)],
            ]);
            // The default dataStore's registry has entry for only dataStore A.
            const entryDefault = createDataStoreRegistryEntry([[dataStoreAName, Promise.resolve(entryA)]]);

            // Create the global registry for the container that can only create the default dataStore.
            const globalRegistryEntries = new Map([[defaultName, Promise.resolve(entryDefault)]]);
            const globalRegistry: IFluidDataStoreRegistry = {
                get IFluidDataStoreRegistry() { return globalRegistry; },
                get: async (pkg) => globalRegistryEntries.get(pkg),
            };
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IFluidDataStoreRegistry: globalRegistry,
                notifyDataStoreInstantiated: (c) => { },
                on: (event, listener) => { },
            } as ContainerRuntime;
            summaryTracker = new SummaryTracker("", 0, 0);
            const summarizerNode = SummarizerNode.createRoot(
                new TelemetryNullLogger(),
                (() => { }) as unknown as SummarizeInternalFn,
                0,
                0,
                true);
            getCreateSummarizerNodeFn = (id: string) => (si: SummarizeInternalFn) => summarizerNode.createChild(
                si,
                id,
                { type: CreateSummarizerNodeSource.Local },
            );
        });

        it("Valid global dataStore", async () => {
            let success: boolean = true;
            const dataStoreId = "default-Id";
            // Create the default dataStore that is in the global registry.
            const context: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                [defaultName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreId),
                attachCb,
                undefined);

            try {
                await context.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);
        });

        it("Invalid global dataStore", async () => {
            let success: boolean = true;
            const dataStoreId = "A-Id";
            // Create dataStore A that is not in the global registry.
            const context: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                [dataStoreAName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreId),
                attachCb,
                undefined);

            try {
                await context.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("Valid subDataStore from the global dataStore", async () => {
            let success: boolean = true;
            const dataStoreId = "A-Id";
            // Create dataStore A that is in the registry of the default dataStore.
            const contextA: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                [defaultName, dataStoreAName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreId),
                attachCb,
                undefined);

            try {
                await contextA.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);
        });

        it("Invalid subDataStore from the global dataStore", async () => {
            let success: boolean = true;
            const dataStoreId = "B-Id";
            // Create dataStore B that is in not the registry of the default dataStore.
            const contextB: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                [defaultName, dataStoreBName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreId),
                attachCb,
                undefined);

            try {
                await contextB.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("Valid subDataStore at depth 2", async () => {
            let success: boolean = true;
            const dataStoreBId = "B-Id";
            // Create dataStore B that is in the registry of dataStore A (which is at depth 2).
            const contextB: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreBId,
                [defaultName, dataStoreAName, dataStoreBName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreBId),
                attachCb,
                undefined);

            try {
                await contextB.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);

            const dataStoreCId = "C-Id";
            // Create dataStore C that is in the registry of dataStore A (which is at depth 2).
            const contextC: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreCId,
                [defaultName, dataStoreAName, dataStoreCName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreCId),
                attachCb,
                undefined);

            try {
                await contextC.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);
        });

        it("Invalid subDataStore at depth 2", async () => {
            let success: boolean = true;
            const dataStoreId = "fake-Id";
            // Create a fake dataStore that is not in the registry of dataStore A (which is at depth 2).
            const contextFake: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                [defaultName, dataStoreAName, "fake"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreId),
                attachCb,
                undefined);

            try {
                await contextFake.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("Invalid subDataStore at depth 3", async () => {
            let success: boolean = true;
            const dataStoreId = "fake-Id";
            // Create a fake dataStore that is not in the registry of dataStore B (which is at depth 3).
            const contextFake: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                [defaultName, dataStoreAName, dataStoreBName, "fake"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreId),
                attachCb,
                undefined);

            try {
                await contextFake.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("SubDataStore which is in the registry of the parent dataStore", async () => {
            let success: boolean = true;
            const dataStoreId = "C-Id";
            // Create dataStore C that is in parent's registry but not in the registry of dataStore B.
            const contextC: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                dataStoreId,
                [defaultName, dataStoreAName, dataStoreBName, dataStoreCName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                getCreateSummarizerNodeFn(dataStoreId),
                attachCb,
                undefined);

            try {
                await contextC.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });
    });
});
