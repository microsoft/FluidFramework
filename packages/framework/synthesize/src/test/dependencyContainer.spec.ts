/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import {
    IComponentConfiguration,
    IFluidLoadable,
    IFluidHandleContext,
} from "@fluidframework/component-core-interfaces";
import { FluidObjectHandle } from "@fluidframework/component-runtime";

import { DependencyContainer } from "..";

const mockHandleContext: IFluidHandleContext = {
    path: "",
    absolutePath: "",
    isAttached: false,
    IFluidRouter: undefined as any,
    IFluidHandleContext: undefined as any,

    attachGraph: () => {
        throw new Error("Method not implemented.");
    },
    bind: () => {
        throw new Error("Method not implemented.");
    },
    request: () => {
        throw new Error("Method not implemented.");
    },
};

class MockLoadable implements IFluidLoadable {
    public get IFluidLoadable() { return this; }
    public get url() { return "url123"; }
    public get handle() { return new FluidObjectHandle(this, "", mockHandleContext); }
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
                dc.register(IFluidLoadable, mock);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`One Optional Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, Promise.resolve(mock));

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`One Optional Provider registered via factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`One Optional Provider registered via Promise factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, mock);

                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, Promise.resolve(mock));

                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via Promise factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`Two Optional Modules all registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<IFluidLoadable & IComponentConfiguration>(
                    { IFluidLoadable, IComponentConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Optional IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Two Optional Modules one registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const s = dc.synthesize<IFluidLoadable & IComponentConfiguration>(
                    { IFluidLoadable, IComponentConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(!config, "Optional IComponentConfiguration was not registered");
            });

            it(`Two Optional Modules none registered`, async () => {
                const dc = new DependencyContainer();

                const s = dc.synthesize<IFluidLoadable & IComponentConfiguration>(
                    { IFluidLoadable, IComponentConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(!loadable, "Optional IFluidLoadable was not registered");
                const config = await s.IComponentConfiguration;
                assert(!config, "Optional IComponentConfiguration was not registered");
            });

            it(`Two Required Modules all registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<{}, IFluidLoadable & IComponentConfiguration>(
                    {}, { IFluidLoadable, IComponentConfiguration });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Required IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Required Provider not registered should throw`, async () => {
                const dc = new DependencyContainer();

                assert.throws(() => dc.synthesize<{}, IFluidLoadable>(
                    {},
                    { IFluidLoadable },
                ), Error);
            });

            it(`Optional Provider found in Parent`, async () => {
                const parentDc = new DependencyContainer();
                const mock = new MockLoadable();
                parentDc.register(IFluidLoadable, mock);
                const dc = new DependencyContainer(parentDc);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`Optional Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer(parentDc);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<IFluidLoadable & IComponentConfiguration>(
                    { IFluidLoadable, IComponentConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Optional IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Optional Provider found in Parent and Child resolves Child`, async () => {
                const parentDc = new DependencyContainer();
                parentDc.register(IFluidLoadable, new MockLoadable());
                const dc = new DependencyContainer(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");
            });

            it(`Required Provider found in Parent`, async () => {
                const parentDc = new DependencyContainer();
                const mock = new MockLoadable();
                parentDc.register(IFluidLoadable, mock);
                const dc = new DependencyContainer(parentDc);

                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.url === mock.url, "IFluidLoadable is valid");
            });

            it(`Required Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer(parentDc);
                const configMock = new MockComponentConfiguration();
                dc.register(IComponentConfiguration, configMock);

                const s = dc.synthesize<{}, IFluidLoadable & IComponentConfiguration>(
                    {}, { IFluidLoadable, IComponentConfiguration });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IComponentConfiguration;
                assert(config, "Required IComponentConfiguration was registered");
                assert(config === configMock, "IComponentConfiguration is expected");
            });

            it(`Required Provider found in Parent and Child resolves Child`, async () => {
                const parentDc = new DependencyContainer();
                parentDc.register(IFluidLoadable, new MockLoadable());
                const dc = new DependencyContainer(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");
            });

            it(`Registering`, async () => {
                const dc = new DependencyContainer();
                dc.register(IFluidLoadable, new MockLoadable());
                assert(dc.has(IFluidLoadable), "DependencyContainer has IFluidLoadable");
                assert(Array.from(dc.registeredTypes).length === 1, "DependencyContainer has one module");
            });

            it(`Registering the same type twice throws`, async () => {
                const dc = new DependencyContainer();
                dc.register(IFluidLoadable, new MockLoadable());
                assert.throws(() => dc.register(IFluidLoadable, new MockLoadable()), Error);
            });

            it(`Registering then Unregistering`, async () => {
                const dc = new DependencyContainer();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.unregister(IFluidLoadable);
                assert(!dc.has(IFluidLoadable), "DependencyContainer doesn't have IFluidLoadable");
                assert(Array.from(dc.registeredTypes).length === 0, "Manager has no modules");
            });

            it(`Registering then Unregistering then Registering`, async () => {
                const dc = new DependencyContainer();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.unregister(IFluidLoadable);
                dc.register(IFluidLoadable, new MockLoadable());
                assert(dc.has(IFluidLoadable), "DependencyContainer has IFluidLoadable");
            });

            it(`has() resolves correctly in all variations`, async () => {
                const dc = new DependencyContainer();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.register(IComponentConfiguration, new MockComponentConfiguration());
                assert(dc.has(IFluidLoadable), "Manager has IFluidLoadable");
                assert(dc.has(IComponentConfiguration), "Manager has IComponentConfiguration");
                assert(
                    dc.has(IFluidLoadable, IComponentConfiguration),
                    "Manager has IFluidLoadable & IComponentConfiguration");
                assert(Array.from(dc.registeredTypes).length === 2, "Manager has two modules");
            });

            it(`registeredModules() resolves correctly`, async () => {
                const dc = new DependencyContainer();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.register(IComponentConfiguration, new MockComponentConfiguration());
                const modules = Array.from(dc.registeredTypes);
                assert(modules.length === 2, "Manager has two modules");
                assert(modules.includes(IFluidLoadable), "Manager has IFluidLoadable");
                assert(modules.includes(IComponentConfiguration), "Manager has IComponentConfiguration");
            });
        });
    });
});
