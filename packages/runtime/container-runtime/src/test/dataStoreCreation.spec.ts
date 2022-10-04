/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { FluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    FluidDataStoreRegistryEntry,
    NamedFluidDataStoreRegistryEntries,
    SummarizeInternalFn,
    CreateChildSummarizerNodeFn,
    CreateSummarizerNodeSource,
} from "@fluidframework/runtime-definitions";
import { createRootSummarizerNodeWithGC } from "@fluidframework/runtime-utils";
import { TelemetryNullLogger } from "@fluidframework/telemetry-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import { LocalFluidDataStoreContext } from "../dataStoreContext";
import { ContainerRuntime } from "../containerRuntime";

describe("Data Store Creation Tests", () => {
    describe("Store creation via local context creation and realize", () => {
        /**
         * These tests simulate dataStore and subDataStore creation by creating local contexts and realizing them.
         * The dataStore tree for these tests is as follows:
         *
         * ```
         *                  Default
         *                     |
         *                     |
         *                DataStore A
         *                   /   \\
         *                  /     \\
         *        DataStore B     DataStore C
         * ```
         */

        let storage: IDocumentStorageService;
        let scope: FluidObject;
        const makeLocallyVisibleFn = () => {};
        let containerRuntime: ContainerRuntime;
        const defaultName = "default";
        const dataStoreAName = "dataStoreA";
        const dataStoreBName = "dataStoreB";
        const dataStoreCName = "dataStoreC";
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
                on: (event, listener) => { },
                logger: new TelemetryNullLogger(),
            } as ContainerRuntime;
            const summarizerNode = createRootSummarizerNodeWithGC(
                new TelemetryNullLogger(),
                (() => { }) as unknown as SummarizeInternalFn,
                0,
                0);
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
            const context: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreId,
                pkg: [defaultName],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
            const context: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreId,
                pkg: [dataStoreAName],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
            const contextA: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreId,
                pkg: [defaultName, dataStoreAName],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
            const contextB: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreId,
                pkg: [defaultName, dataStoreBName],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
            const contextB: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreBId,
                pkg: [defaultName, dataStoreAName, dataStoreBName],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreBId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

            try {
                await contextB.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);

            const dataStoreCId = "C-Id";
            // Create dataStore C that is in the registry of dataStore A (which is at depth 2).
            const contextC: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreCId,
                pkg: [defaultName, dataStoreAName, dataStoreCName],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreCId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
            const contextFake: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreId,
                pkg: [defaultName, dataStoreAName, "fake"],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
            const contextFake: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreId,
                pkg: [defaultName, dataStoreAName, "fake"],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
            const contextC: LocalFluidDataStoreContext = new LocalFluidDataStoreContext({
                id: dataStoreId,
                pkg: [defaultName, dataStoreAName, dataStoreBName, dataStoreCName],
                runtime: containerRuntime,
                storage,
                scope,
                createSummarizerNodeFn: getCreateSummarizerNodeFn(dataStoreId),
                makeLocallyVisibleFn,
                snapshotTree: undefined,
                isRootDataStore: false,
            });

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
