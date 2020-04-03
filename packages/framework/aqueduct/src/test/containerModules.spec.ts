/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";

import {
    IComponentConfiguration,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";

import { ModuleManager, Empty } from "../container-modules";

export interface IFoo {
    foo: string;
}

export class Foo {
    public foo() {
        console.log("foo");
    }
}

class MockLoadable implements IComponentLoadable {
    public get IComponentLoadable() { return this; }
    public get url() { return "url123"; }
}

class MockComponentConfiguration implements IComponentConfiguration {
    public get IComponentConfiguration() { return this; }
    public get canReconnect() { return false; }
    public get scopes() { return ["hello"]; }
}

describe("Routerlicious", () => {
    describe("Aqueduct", () => {
        describe("ContainerModules", () => {
            it(`One Optional Module registered`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());

                const s = manager.resolve<IComponentLoadable>({IComponentLoadable}, {});
                assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            });

            it(`Multiple Optional Module all registered`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());
                manager.register(IComponentConfiguration, new MockComponentConfiguration());

                const s = manager.resolve<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable,IComponentConfiguration}, {});
                assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
                assert(s.IComponentConfiguration, "Optional IComponentConfiguration was registered");
            });

            it(`Multiple Optional Module none registered`, async () => {
                const manager = new ModuleManager();
                const s = manager.resolve<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable,IComponentConfiguration}, {});
                assert(!s.IComponentLoadable, "Optional IComponentLoadable was not registered");
                assert(!s.IComponentConfiguration, "Optional IComponentConfiguration was not registered");
            });

            it(`Two Optional Module one registered`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());
                const s = manager.resolve<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable,IComponentConfiguration}, {});
                assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
                assert(!s.IComponentConfiguration, "Optional IComponentConfiguration was not registered");
            });

            it(`One Required Module registered`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());

                const s = manager.resolve<{}, IComponentLoadable>(
                    {},
                    {IComponentLoadable},
                );

                assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
            });

            it(`One Required Module registered`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());

                const s = manager.resolve<Empty, IComponentLoadable>(
                    {},
                    {IComponentLoadable},
                );

                assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
            });

            it(`Multiple Required Module all registered`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());
                manager.register(IComponentConfiguration, new MockComponentConfiguration());

                const s = manager.resolve<Empty, IComponentLoadable & IComponentConfiguration>(
                    {},
                    {IComponentLoadable, IComponentConfiguration},
                );

                assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
                assert(s.IComponentConfiguration, "Required IComponentConfiguration was registered");
            });

            it(`Required Module not registered should throw`, async () => {
                const manager = new ModuleManager();

                assert.throws(() => manager.resolve<{}, IComponentLoadable>(
                    {},
                    {IComponentLoadable},
                ), Error);
            });

            it(`Optional Module found in Parent`, async () => {
                const parentManager = new ModuleManager();
                parentManager.register(IComponentLoadable, new MockLoadable());
                const manager = new ModuleManager(parentManager);

                const s = manager.resolve<IComponentLoadable>({IComponentLoadable}, {});
                assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            });

            it(`Optional Module found in Parent and Child`, async () => {
                const parentManager = new ModuleManager();
                parentManager.register(IComponentLoadable, new MockLoadable());
                const manager = new ModuleManager(parentManager);
                manager.register(IComponentConfiguration, new MockComponentConfiguration());

                const s = manager.resolve<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable, IComponentConfiguration}, {});
                assert(s.IComponentLoadable, "Optional IComponentLoadable was registered");
            });

            it(`Optional Module in Parent and Child resolves Child`, async () => {
                const parentManager = new ModuleManager();
                parentManager.register(IComponentLoadable, new MockLoadable());
                const manager = new ModuleManager(parentManager);
                const childLoadableModule = new MockLoadable();
                manager.register(IComponentLoadable, childLoadableModule);

                const s = manager.resolve<IComponentLoadable>(
                    {IComponentLoadable}, {});
                assert(s.IComponentLoadable === childLoadableModule, "Child Module loaded");
            });

            it(`Required Module found in Parent`, async () => {
                const parentManager = new ModuleManager();
                parentManager.register(IComponentLoadable, new MockLoadable());
                const manager = new ModuleManager(parentManager);

                const s = manager.resolve<{}, IComponentLoadable>({}, {IComponentLoadable});
                assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
            });

            it(`Required Module found in Parent and Child`, async () => {
                const parentManager = new ModuleManager();
                parentManager.register(IComponentLoadable, new MockLoadable());
                const manager = new ModuleManager(parentManager);
                manager.register(IComponentConfiguration, new MockComponentConfiguration());

                const s = manager.resolve<{}, IComponentLoadable & IComponentConfiguration>(
                    {}, {IComponentLoadable, IComponentConfiguration});
                assert(s.IComponentLoadable, "Required IComponentLoadable was registered");
                assert(s.IComponentConfiguration, "Required IComponentConfiguration was registered");
            });

            it(`Registering the same type twice throws`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());
                assert.throws(() => manager.register(IComponentLoadable, new MockLoadable()), Error);
            });

            it(`Registering then Unregistering`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());
                manager.unregister(IComponentLoadable);
                assert(!manager.has(IComponentLoadable), "Manager doesn't have IComponentLoadable");
                assert(Array.from(manager.registeredModules).length === 0, "Manager has no modules");
            });

            it(`Registering then Unregistering then registering`, async () => {
                const manager = new ModuleManager();
                manager.register(IComponentLoadable, new MockLoadable());
                manager.unregister(IComponentLoadable);
                manager.register(IComponentLoadable, new MockLoadable());
                assert(manager.has(IComponentLoadable), "Manager has IComponentLoadable");
            });
        });
    });
});
