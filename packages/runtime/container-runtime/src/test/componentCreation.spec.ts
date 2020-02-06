/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    IComponentRuntime,
    ComponentRegistryEntry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
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
        const attachCb = (mR: IComponentRuntime) => {};
        let containerRuntime: ContainerRuntime;
        const defaultName = "default";
        const componentAName = "componentA";
        const componentBName = "componentB";
        const componentCName = "componentC";

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
            let registry: IComponentRegistry;
            // eslint-disable-next-line prefer-const
            registry = {
                IComponentRegistry: registry,
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
            // Component B is a leaf component and itss registry does not have any entries.
            const entryB = createComponentRegistryEntry([]);
            // Component C is a leaf component and itss registry does not have any entries.
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
            let globalRegistry: IComponentRegistry;
            // eslint-disable-next-line prefer-const
            globalRegistry = {
                IComponentRegistry: globalRegistry,
                get: async (pkg) => globalRegistryEntries.get(pkg),
            };
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            containerRuntime = { IComponentRegistry: globalRegistry } as ContainerRuntime;
        });

        it("Valid global component", async () => {
            // Create the default component that is in the global registry.
            const context: LocalComponentContext = new LocalComponentContext(
                "default-Id",
                [defaultName],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtime: IComponentRuntime = await context.realize();
            // Verify that we get a valid IComponentRuntime.
            assert.notStrictEqual(runtime, undefined);
        });

        it("Invalid global component", async () => {
            // Create component A that is not in the global registry.
            const context: LocalComponentContext = new LocalComponentContext(
                "A-Id",
                [componentAName],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtime: IComponentRuntime = await context.realize();
            // Verify that we don't get a valid IComponentRuntime.
            assert.strictEqual(runtime, undefined);
        });

        it("Valid subcomponent from the global component", async () => {
            // Create component A that is in the registry of the default component.
            const contextA: LocalComponentContext = new LocalComponentContext(
                "A-Id",
                [defaultName, componentAName],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtime: IComponentRuntime = await contextA.realize();
            // Verify that we get a valid IComponentRuntime.
            assert.notStrictEqual(runtime, undefined);
        });

        it("Invalid subcomponent from the global component", async () => {
            // Create component B that is in not the registry of the default component.
            const contextB: LocalComponentContext = new LocalComponentContext(
                "B-Id",
                [defaultName, componentBName],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtime: IComponentRuntime =  await contextB.realize();
            // Verify that we don't get a valid IComponentRuntime.
            assert.strictEqual(runtime, undefined);
        });

        it("Valid subcomponent at depth 2", async () => {
            // Create component B that is in the registry of component A (which is at depth 2).
            const contextB: LocalComponentContext = new LocalComponentContext(
                "B-Id",
                [defaultName, componentAName, componentBName],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtimeB: IComponentRuntime = await contextB.realize();
            // Verify that we get a valid IComponentRuntime.
            assert.notStrictEqual(runtimeB, undefined);

            // Create component C that is in the registry of component A (which is at depth 2).
            const contextC: LocalComponentContext = new LocalComponentContext(
                "C-Id",
                [defaultName, componentAName, componentCName],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtimeC: IComponentRuntime = await contextC.realize();
            // Verify that we get a valid IComponentRuntime.
            assert.notStrictEqual(runtimeC, undefined);
        });

        it("Invalid subcomponent at depth 2", async () => {
            // Create a fake component that is not in the registry of component A (which is at depth 2).
            const contextFake: LocalComponentContext = new LocalComponentContext(
                "fake-Id",
                [defaultName, componentAName, "fake"],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtime: IComponentRuntime = await contextFake.realize();
            // Verify that we don't get a valid IComponentRuntime.
            assert.strictEqual(runtime, undefined);
        });

        it("Invalid subcomponent at depth 3", async () => {
            // Create a fake component that is not in the registry of component B (which is at depth 3).
            const contextFake: LocalComponentContext = new LocalComponentContext(
                "fake-Id",
                [defaultName, componentAName, componentBName, "fake"],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtime: IComponentRuntime = await contextFake.realize();
            // Verify that we don't get a valid IComponentRuntime.
            assert.strictEqual(runtime, undefined);
        });

        it("Subcomponent which is in the registry of the parent component", async () => {
            // Create component C that is in parent's registry but not in the registry of component B.
            const contextC: LocalComponentContext = new LocalComponentContext(
                "C-Id",
                [defaultName, componentAName, componentBName, componentCName],
                containerRuntime,
                storage,
                scope,
                attachCb);

            const runtime: IComponentRuntime = await contextC.realize();
            // Verify that we don't get a valid IComponentRuntime because the component being created was
            // not in the current component's registry or the global registry.
            assert.strictEqual(runtime, undefined);
        });
    });
});
