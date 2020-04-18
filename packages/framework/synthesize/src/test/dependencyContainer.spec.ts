/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";

import {
    IComponentConfiguration,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";

import { DependencyContainer } from "..";

class MockLoadable implements IComponentLoadable {
    public get IComponentLoadable() { return this; }
    public get url() { return "url123"; }
}

class MockComponentConfiguration implements IComponentConfiguration {
    public get IComponentConfiguration() { return this; }
    public get canReconnect() { return false; }
    public get scopes() { return ["scope"]; }
}

describe("Routerlicious", () => {
    describe("Aqueduct", () => {
        describe("DependencyContainer", () => {
            it(`One Optional Provider registered via value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IComponentLoadable, mock);

                const s = dc.synthesize<IComponentLoadable>({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`One Optional Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IComponentLoadable, Promise.resolve(mock));

                const s = dc.synthesize<IComponentLoadable>({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`One Optional Provider registered via factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IComponentLoadable, factory);

                const s = dc.synthesize<IComponentLoadable>({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`One Optional Provider registered via Promise factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IComponentLoadable, factory);

                const s = dc.synthesize<IComponentLoadable>({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`One Required Provider registered via value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IComponentLoadable, mock);

                const s = dc.synthesize<{}, IComponentLoadable>({}, {IComponentLoadable});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`One Required Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IComponentLoadable, Promise.resolve(mock));

                const s = dc.synthesize<{}, IComponentLoadable>({}, {IComponentLoadable});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`One Required Provider registered via factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IComponentLoadable, factory);

                const s = dc.synthesize<{}, IComponentLoadable>({}, {IComponentLoadable});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`One Required Provider registered via Promise factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IComponentLoadable, factory);

                const s = dc.synthesize<{}, IComponentLoadable>({}, {IComponentLoadable});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`Two Optional Modules all registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IComponentLoadable, loadableMock);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable, IComponentConfiguration}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === loadableMock, "IComponentLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Optional IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Two Optional Modules one registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IComponentLoadable, loadableMock);

                const s = dc.synthesize<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable, IComponentConfiguration}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === loadableMock, "IComponentLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(!config, "Optional IComponentConfiguration was not registered");
            });

            it(`Two Optional Modules none registered`, async () => {
                const dc = new DependencyContainer();

                const s = dc.synthesize<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable, IComponentConfiguration}, {});
                const loadable = await s.IComponentLoadable;
                assert(!loadable, "Optional IComponentLoadable was not registered");
                const config = await s.IComponentConfiguration;
                assert(!config, "Optional IComponentConfiguration was not registered");
            });

            it(`Two Required Modules all registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IComponentLoadable, loadableMock);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<{}, IComponentLoadable & IComponentConfiguration>(
                    {}, {IComponentLoadable, IComponentConfiguration});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === loadableMock, "IComponentLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Required IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Required Provider not registered should throw`, async () => {
                const dc = new DependencyContainer();

                assert.throws(() => dc.synthesize<{}, IComponentLoadable>(
                    {},
                    { IComponentLoadable },
                ), Error);
            });

            it(`Optional Provider found in Parent`, async () => {
                const parentDc = new DependencyContainer();
                const mock = new MockLoadable();
                parentDc.register(IComponentLoadable, mock);
                const dc = new DependencyContainer(parentDc);

                const s = dc.synthesize<IComponentLoadable>({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`Optional Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                parentDc.register(IComponentLoadable, loadableMock);
                const dc = new DependencyContainer(parentDc);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<IComponentLoadable & IComponentConfiguration>(
                    {IComponentLoadable, IComponentConfiguration}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === loadableMock, "IComponentLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Optional IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Optional Provider found in Parent and Child resolves Child`, async () => {
                const parentDc = new DependencyContainer();
                parentDc.register(IComponentLoadable, new MockLoadable());
                const dc = new DependencyContainer(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IComponentLoadable, loadableMock);

                const s = dc.synthesize<IComponentLoadable>({IComponentLoadable}, {});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Optional IComponentLoadable was registered");
                assert(loadable === loadableMock, "IComponentLoadable is expected");
            });

            it(`Required Provider found in Parent`, async () => {
                const parentDc = new DependencyContainer();
                const mock = new MockLoadable();
                parentDc.register(IComponentLoadable, mock);
                const dc = new DependencyContainer(parentDc);

                const s = dc.synthesize<{}, IComponentLoadable>({}, {IComponentLoadable});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === mock, "IComponentLoadable is expected");
                assert(loadable?.url === mock.url, "IComponentLoadable is valid");
            });

            it(`Required Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                parentDc.register(IComponentLoadable, loadableMock);
                const dc = new DependencyContainer(parentDc);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<{}, IComponentLoadable & IComponentConfiguration>(
                    {}, {IComponentLoadable, IComponentConfiguration});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === loadableMock, "IComponentLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Required IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Required Provider found in Parent and Child resolves Child`, async () => {
                const parentDc = new DependencyContainer();
                parentDc.register(IComponentLoadable, new MockLoadable());
                const dc = new DependencyContainer(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IComponentLoadable, loadableMock);

                const s = dc.synthesize<{}, IComponentLoadable>({}, {IComponentLoadable});
                const loadable = await s.IComponentLoadable;
                assert(loadable, "Required IComponentLoadable was registered");
                assert(loadable === loadableMock, "IComponentLoadable is expected");
            });

            it(`Registering`, async () => {
                const dc = new DependencyContainer();
                dc.register(IComponentLoadable, new MockLoadable());
                assert(dc.has(IComponentLoadable), "DependencyContainer has IComponentLoadable");
                assert(Array.from(dc.registeredTypes).length === 1, "DependencyContainer has one module");
            });

            it(`Registering the same type twice throws`, async () => {
                const dc = new DependencyContainer();
                dc.register(IComponentLoadable, new MockLoadable());
                assert.throws(() => dc.register(IComponentLoadable, new MockLoadable()), Error);
            });

            it(`Registering then Unregistering`, async () => {
                const dc = new DependencyContainer();
                dc.register(IComponentLoadable, new MockLoadable());
                dc.unregister(IComponentLoadable);
                assert(!dc.has(IComponentLoadable), "DependencyContainer doesn't have IComponentLoadable");
                assert(Array.from(dc.registeredTypes).length === 0, "Manager has no modules");
            });

            it(`Registering then Unregistering then Registering`, async () => {
                const dc = new DependencyContainer();
                dc.register(IComponentLoadable, new MockLoadable());
                dc.unregister(IComponentLoadable);
                dc.register(IComponentLoadable, new MockLoadable());
                assert(dc.has(IComponentLoadable), "DependencyContainer has IComponentLoadable");
            });

            it(`has() resolves correctly in all variations`, async () => {
                const dc = new DependencyContainer();
                dc.register(IComponentLoadable, new MockLoadable());
                dc.register(IComponentConfiguration, new MockComponentConfiguration());
                assert(dc.has(IComponentLoadable), "Manager has IComponentLoadable");
                assert(dc.has(IComponentConfiguration), "Manager has IComponentConfiguration");
                assert(
                    dc.has(IComponentLoadable, IComponentConfiguration),
                    "Manager has IComponentLoadable & IComponentConfiguration");
                assert(Array.from(dc.registeredTypes).length === 2, "Manager has two modules");
            });

            it(`registeredModules() resolves correctly`, async () => {
                const dc = new DependencyContainer();
                dc.register(IComponentLoadable, new MockLoadable());
                dc.register(IComponentConfiguration, new MockComponentConfiguration());
                const modules = Array.from(dc.registeredTypes);
                assert(modules.length === 2, "Manager has two modules");
                assert(modules.includes(IComponentLoadable), "Manager has IComponentLoadable");
                assert(modules.includes(IComponentConfiguration), "Manager has IComponentConfiguration");
            });
        });
    });
});
