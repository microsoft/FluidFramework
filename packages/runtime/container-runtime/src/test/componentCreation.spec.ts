/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import {
    IComponentRuntimeChannel,
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    ComponentRegistryEntry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
import { SummaryTracker } from "@microsoft/fluid-runtime-utils";
import { LocalComponentContext } from "../componentContext";
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
        let scope: IComponent;
        const attachCb = (mR: IComponentRuntimeChannel) => { };
        let containerRuntime: ContainerRuntime;
        const defaultName = "default";
        const componentAName = "componentA";
        const componentBName = "componentB";
        const componentCName = "componentC";
        let summaryTracker: SummaryTracker;

        // Helper function that creates a ComponentRegistryEntry with the registry entries
        // provided to it.
        function createComponentRegistryEntry(entries: NamedComponentRegistryEntries): ComponentRegistryEntry {
            const registryEntries = new Map(entries);
            const factory: IComponentFactory = {
                get IComponentFactory() { return factory; },
                instantiateComponent: (context: IComponentContext) => {
                    context.bindRuntime(new MockRuntime());
                },
            };
            const registry: IComponentRegistry = {
                get IComponentRegistry() { return registry; },
                // Returns the registry entry as per the entries provided in the param.
                get: async (pkg) => registryEntries.get(pkg),
            };

            const entry: ComponentRegistryEntry = {
                get IComponentFactory() { return factory; },
                get IComponentRegistry() { return registry; },
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
            const globalRegistry: IComponentRegistry = {
                get IComponentRegistry() { return globalRegistry; },
                get: async (pkg) => globalRegistryEntries.get(pkg),
            };
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = {
                IComponentRegistry: globalRegistry,
                notifyComponentInstantiated: (c) => {},
            } as ContainerRuntime;
            summaryTracker = new SummaryTracker(true, "", 0, 0, async () => undefined);
        });

        it("Valid global component", async () => {
            let success: boolean = true;
            // Create the default component that is in the global registry.
            const context: LocalComponentContext = new LocalComponentContext(
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
            const context: LocalComponentContext = new LocalComponentContext(
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
            const contextA: LocalComponentContext = new LocalComponentContext(
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
            const contextB: LocalComponentContext = new LocalComponentContext(
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
            const contextB: LocalComponentContext = new LocalComponentContext(
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
            const contextC: LocalComponentContext = new LocalComponentContext(
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
            const contextFake: LocalComponentContext = new LocalComponentContext(
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
            const contextFake: LocalComponentContext = new LocalComponentContext(
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
            const contextC: LocalComponentContext = new LocalComponentContext(
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
