/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
    IFluidConfiguration,
    IFluidLoadable,
    IFluidHandleContext,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";

import { DependencyContainer } from "..";
import { IFluidDependencySynthesizer } from "../IFluidDependencySynthesizer";
import { FluidObjectProvider } from "../types";

const mockHandleContext: IFluidHandleContext = {
    absolutePath: "",
    isAttached: false,
    IFluidHandleContext: undefined as any,

    attachGraph: () => {
        throw new Error("Method not implemented.");
    },
    resolveHandle: () => {
        throw new Error("Method not implemented.");
    },
};

class MockLoadable implements IFluidLoadable {
    public get IFluidLoadable() { return this; }
    public get handle() { return new FluidObjectHandle(this, "", mockHandleContext); }
}

class MockFluidConfiguration implements IFluidConfiguration {
    public get IFluidConfiguration() { return this; }
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
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Optional Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, Promise.resolve(mock));

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
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
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
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
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, mock);

                // eslint-disable-next-line @typescript-eslint/ban-types
                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, Promise.resolve(mock));

                // eslint-disable-next-line @typescript-eslint/ban-types
                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IFluidLoadable, factory);

                // eslint-disable-next-line @typescript-eslint/ban-types
                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via Promise factory`, async () => {
                const dc = new DependencyContainer();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IFluidLoadable, factory);

                // eslint-disable-next-line @typescript-eslint/ban-types
                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`Two Optional Modules all registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);
                const configMock = new MockFluidConfiguration();
                dc.register(IFluidConfiguration, configMock);

                const s = dc.synthesize<IFluidLoadable & IFluidConfiguration>(
                    { IFluidLoadable, IFluidConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IFluidConfiguration;
                assert(config, "Optional IFluidConfiguration was registered");
                assert(config === configMock, "IFluidConfiguration is expected");
            });

            it(`Two Optional Modules one registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const s = dc.synthesize<IFluidLoadable & IFluidConfiguration>(
                    { IFluidLoadable, IFluidConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IFluidConfiguration;
                assert(!config, "Optional IFluidConfiguration was not registered");
            });

            it(`Two Optional Modules none registered`, async () => {
                const dc = new DependencyContainer();

                const s = dc.synthesize<IFluidLoadable & IFluidConfiguration>(
                    { IFluidLoadable, IFluidConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(!loadable, "Optional IFluidLoadable was not registered");
                const config = await s.IFluidConfiguration;
                assert(!config, "Optional IFluidConfiguration was not registered");
            });

            it(`Two Required Modules all registered`, async () => {
                const dc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);
                const configMock = new MockFluidConfiguration();
                dc.register(IFluidConfiguration, configMock);

                // eslint-disable-next-line @typescript-eslint/ban-types
                const s = dc.synthesize<{}, IFluidLoadable & IFluidConfiguration>(
                    {}, { IFluidLoadable, IFluidConfiguration });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IFluidConfiguration;
                assert(config, "Required IFluidConfiguration was registered");
                assert(config === configMock, "IFluidConfiguration is expected");
            });

            it(`Required Provider not registered should throw`, async () => {
                const dc = new DependencyContainer();

                // eslint-disable-next-line @typescript-eslint/ban-types
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
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`Optional Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer(parentDc);
                const configMock = new MockFluidConfiguration();
                dc.register(IFluidConfiguration, configMock);

                const s = dc.synthesize<IFluidLoadable & IFluidConfiguration>(
                    { IFluidLoadable, IFluidConfiguration }, {});
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IFluidConfiguration;
                assert(config, "Optional IFluidConfiguration was registered");
                assert(config === configMock, "IFluidConfiguration is expected");
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

                // eslint-disable-next-line @typescript-eslint/ban-types
                const s = dc.synthesize<{}, IFluidLoadable>({}, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`Required Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer(parentDc);
                const configMock = new MockFluidConfiguration();
                dc.register(IFluidConfiguration, configMock);

                // eslint-disable-next-line @typescript-eslint/ban-types
                const s = dc.synthesize<{}, IFluidLoadable & IFluidConfiguration>(
                    {}, { IFluidLoadable, IFluidConfiguration });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const config = await s.IFluidConfiguration;
                assert(config, "Required IFluidConfiguration was registered");
                assert(config === configMock, "IFluidConfiguration is expected");
            });

            it(`Required Provider found in Parent and Child resolves Child`, async () => {
                const parentDc = new DependencyContainer();
                parentDc.register(IFluidLoadable, new MockLoadable());
                const dc = new DependencyContainer(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                // eslint-disable-next-line @typescript-eslint/ban-types
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
                dc.register(IFluidConfiguration, new MockFluidConfiguration());
                assert(dc.has(IFluidLoadable), "Manager has IFluidLoadable");
                assert(dc.has(IFluidConfiguration), "Manager has IFluidConfiguration");
                assert(
                    dc.has(IFluidLoadable) && dc.has(IFluidConfiguration),
                    "Manager has IFluidLoadable & IFluidConfiguration");
                assert(Array.from(dc.registeredTypes).length === 2, "Manager has two modules");
            });

            it(`registeredModules() resolves correctly`, async () => {
                const dc = new DependencyContainer();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.register(IFluidConfiguration, new MockFluidConfiguration());
                const modules = Array.from(dc.registeredTypes);
                assert(modules.length === 2, "Manager has two modules");
                assert(modules.includes(IFluidLoadable), "Manager has IFluidLoadable");
                assert(modules.includes(IFluidConfiguration), "Manager has IFluidConfiguration");
            });

            it(`Child has Parent modules`, async () => {
                const parentDc = new DependencyContainer();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer(parentDc);
                const configMock = new MockFluidConfiguration();
                dc.register(IFluidConfiguration, configMock);

                assert(dc.has(IFluidLoadable), "has includes parent registered");
                assert(!dc.has(IFluidLoadable, true),"has does not include excluded parent registered");
                assert(dc.has(IFluidConfiguration),"has includes registered");
                assert(!dc.has(IFluidHandle),"does not include not registered");
            });

            it(`Parent Resolved from Child`, async () => {
                const parentDc = new DependencyContainer();
                const loadableToHandle: FluidObjectProvider<"IFluidHandle"> =
                    async (fds: IFluidDependencySynthesizer) => {
                        // eslint-disable-next-line @typescript-eslint/ban-types
                        const loadable = fds.synthesize<{},IFluidLoadable>({},{IFluidLoadable});
                        return (await loadable.IFluidLoadable).handle;
                    };
                parentDc.register(IFluidHandle, loadableToHandle);

                const dc = new DependencyContainer(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const deps = dc.synthesize<IFluidHandle>({IFluidHandle}, {});
                assert(await deps.IFluidHandle !== undefined, "handle undefined");
            });
        });
    });
});
