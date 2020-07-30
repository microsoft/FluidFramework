/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import {
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    FluidDataStoreRegistryEntry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { IFluidObject } from "@fluidframework/component-core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SummaryTracker } from "@fluidframework/runtime-utils";
import { LocalFluidDataStoreContext } from "../componentContext";
import { ContainerRuntime } from "../containerRuntime";

describe("Component Creation Tests", () => {
    describe("Component creation via local context creation and realize", () => {
        /**
         * These tests simulate component and subcomponent creation by creating local contexts and realizing them.
         * The component tree for these tests is as follows:
         *
         *                  Default
         *                     |
         *                     |
         *                Component A
         *                   /   \
         *                  /     \
         *        Component B     Component C
         */

        let storage: IDocumentStorageService;
        let scope: IFluidObject & IFluidObject;
        const attachCb = (mR: IFluidDataStoreChannel) => { };
        let containerRuntime: ContainerRuntime;
        const defaultName = "default";
        const componentAName = "componentA";
        const componentBName = "componentB";
        const componentCName = "componentC";
        let summaryTracker: SummaryTracker;

        // Helper function that creates a FluidDataStoreRegistryEntry with the registry entries
        // provided to it.
        function createComponentRegistryEntry(entries: NamedFluidDataStoreRegistryEntries): FluidDataStoreRegistryEntry {
            const registryEntries = new Map(entries);
            const factory: IFluidDataStoreFactory = {
                get IFluidDataStoreFactory() { return factory; },
                instantiateDataStore: (context: IFluidDataStoreContext) => {
                    context.bindRuntime(new MockFluidDataStoreRuntime());
                },
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
            // Component B is a leaf component and its registry does not have any entries.
            const entryB = createComponentRegistryEntry([]);
            // Component C is a leaf component and its registry does not have any entries.
            const entryC = createComponentRegistryEntry([]);
            // Component A's registry has entries for component B and component C.
            const entryA = createComponentRegistryEntry([
                [componentBName, Promise.resolve(entryB)],
                [componentCName, Promise.resolve(entryC)],
            ]);
            // The default component's registry has entry for only component A.
            const entryDefault = createComponentRegistryEntry([[componentAName, Promise.resolve(entryA)]]);

            // Create the global registry for the container that can only create the default component.
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
        });

        it("Valid global component", async () => {
            let success: boolean = true;
            // Create the default component that is in the global registry.
            const context: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "default-Id",
                [defaultName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await context.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);
        });

        it("Invalid global component", async () => {
            let success: boolean = true;
            // Create component A that is not in the global registry.
            const context: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "A-Id",
                [componentAName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await context.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("Valid subcomponent from the global component", async () => {
            let success: boolean = true;
            // Create component A that is in the registry of the default component.
            const contextA: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "A-Id",
                [defaultName, componentAName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await contextA.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);
        });

        it("Invalid subcomponent from the global component", async () => {
            let success: boolean = true;
            // Create component B that is in not the registry of the default component.
            const contextB: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "B-Id",
                [defaultName, componentBName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await contextB.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("Valid subcomponent at depth 2", async () => {
            let success: boolean = true;
            // Create component B that is in the registry of component A (which is at depth 2).
            const contextB: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "B-Id",
                [defaultName, componentAName, componentBName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await contextB.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);

            // Create component C that is in the registry of component A (which is at depth 2).
            const contextC: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "C-Id",
                [defaultName, componentAName, componentCName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await contextC.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize was successful.
            assert.strictEqual(success, true);
        });

        it("Invalid subcomponent at depth 2", async () => {
            let success: boolean = true;
            // Create a fake component that is not in the registry of component A (which is at depth 2).
            const contextFake: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "fake-Id",
                [defaultName, componentAName, "fake"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await contextFake.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("Invalid subcomponent at depth 3", async () => {
            let success: boolean = true;
            // Create a fake component that is not in the registry of component B (which is at depth 3).
            const contextFake: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "fake-Id",
                [defaultName, componentAName, componentBName, "fake"],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

            try {
                await contextFake.realize();
            } catch (error) {
                success = false;
            }
            // Verify that realize throws an error.
            assert.strictEqual(success, false);
        });

        it("Subcomponent which is in the registry of the parent component", async () => {
            let success: boolean = true;
            // Create component C that is in parent's registry but not in the registry of component B.
            const contextC: LocalFluidDataStoreContext = new LocalFluidDataStoreContext(
                "C-Id",
                [defaultName, componentAName, componentBName, componentCName],
                containerRuntime,
                storage,
                scope,
                summaryTracker,
                attachCb);

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
