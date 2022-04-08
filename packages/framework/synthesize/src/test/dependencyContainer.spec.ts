/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
    IFluidLoadable,
    IFluidHandleContext,
    IFluidHandle,
    IProvideFluidLoadable,
    IProvideFluidRouter,
    IProvideFluidHandle,
    FluidObject,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";

import { DependencyContainer } from "..";
import { IFluidDependencySynthesizer } from "../IFluidDependencySynthesizer";
import { AsyncFluidObjectProvider, FluidObjectProvider, FluidObjectSymbolProvider } from "../types";

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

class MockFluidRouter implements IFluidRouter {
    public get IFluidRouter() { return this; }
    public async request() {
        return {
            mimeType: "",
            status: 200,
            value: "",
        };
    }
}

describe("Routerlicious", () => {
    describe("Aqueduct", () => {
        describe("DependencyContainer", () => {
            it(`One Optional Provider registered via value`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, mock);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Optional Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, Promise.resolve(mock));

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Optional Provider registered via factory`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Optional Provider registered via Promise factory`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via value`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, mock);

                const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via Promise value`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                dc.register(IFluidLoadable, Promise.resolve(mock));

                const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via factory`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                const factory = () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`One Required Provider registered via Promise factory`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                const factory = async () => mock;
                dc.register(IFluidLoadable, factory);

                const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`Two Optional Modules all registered`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable & IFluidRouter>>();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);
                const routerMock = new MockFluidRouter();
                dc.register(IFluidRouter, routerMock);

                const s = dc.synthesize<IFluidLoadable & IFluidRouter>(
                    { IFluidLoadable, IFluidRouter }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const router = await s.IFluidRouter;
                assert(router, "Optional IFluidRouter was registered");
                assert(router === routerMock, "IFluidRouter is expected");
            });

            it(`Two Optional Modules one registered`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable & IFluidRouter>>();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const s = dc.synthesize<IFluidLoadable & IFluidRouter>(
                    { IFluidLoadable, IFluidRouter }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const router = await s.IFluidRouter;
                assert(!router, "Optional IFluidRouter was not registered");
            });

            it(`Two Optional Modules none registered`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable & IFluidRouter>>();

                const s = dc.synthesize<IFluidLoadable & IFluidRouter>(
                    { IFluidLoadable, IFluidRouter }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(!loadable, "Optional IFluidLoadable was not registered");
                const router = await s.IFluidRouter;
                assert(!router, "Optional IFluidRouter was not registered");
            });

            it(`Two Required Modules all registered`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable & IFluidRouter>>();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);
                const routerMock = new MockFluidRouter();
                dc.register(IFluidRouter, routerMock);

                const s = dc.synthesize<undefined, IProvideFluidLoadable & IProvideFluidRouter>(
                    undefined, { IFluidLoadable, IFluidRouter });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const router = await s.IFluidRouter;
                assert(router, "Required IFluidRouter was registered");
                assert(router === routerMock, "IFluidRouter is expected");
            });

            it(`Required Provider not registered should throw`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();

                assert.throws(() => dc.synthesize<undefined, IProvideFluidLoadable>(
                    undefined,
                    { IFluidLoadable },
                ), Error);
            });

            it(`Optional Provider found in Parent`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                parentDc.register(IFluidLoadable, mock);
                const dc = new DependencyContainer(parentDc);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`Optional Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer<FluidObject<IFluidRouter>>(parentDc);
                const routerMock = new MockFluidRouter();
                dc.register(IFluidRouter, routerMock);

                const s = dc.synthesize<IFluidLoadable & IFluidRouter>(
                    { IFluidLoadable, IFluidRouter }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const router = await s.IFluidRouter;
                assert(router, "Optional IFluidRouter was registered");
                assert(router === routerMock, "IFluidRouter is expected");
            });

            it(`Optional Provider found in Parent and Child resolves Child`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                parentDc.register(IFluidLoadable, new MockLoadable());
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Optional IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");
            });

            it(`Required Provider found in Parent`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const mock = new MockLoadable();
                parentDc.register(IFluidLoadable, mock);
                const dc = new DependencyContainer(parentDc);

                const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === mock, "IFluidLoadable is expected");
                assert(loadable?.handle.absolutePath === mock.handle.absolutePath, "IFluidLoadable is valid");
            });

            it(`Required Modules found in Parent and Child`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer<FluidObject<IFluidRouter>>(parentDc);
                const routerMock = new MockFluidRouter();
                dc.register(IFluidRouter, routerMock);

                const s = dc.synthesize<undefined, IProvideFluidLoadable & IProvideFluidRouter>(
                    undefined, { IFluidLoadable, IFluidRouter });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");

                const router = await s.IFluidRouter;
                assert(router, "Required IFluidRouter was registered");
                assert(router === routerMock, "IFluidRouter is expected");
            });

            it(`Required Provider found in Parent and Child resolves Child`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                parentDc.register(IFluidLoadable, new MockLoadable());
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, { IFluidLoadable });
                const loadable = await s.IFluidLoadable;
                assert(loadable, "Required IFluidLoadable was registered");
                assert(loadable === loadableMock, "IFluidLoadable is expected");
            });

            it(`Registering`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                dc.register(IFluidLoadable, new MockLoadable());
                assert(dc.has(IFluidLoadable), "DependencyContainer has IFluidLoadable");
            });

            it(`Registering the same type twice throws`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                dc.register(IFluidLoadable, new MockLoadable());
                assert.throws(() => dc.register(IFluidLoadable, new MockLoadable()), Error);
            });

            it(`Registering then Unregistering`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.unregister(IFluidLoadable);
                assert(!dc.has(IFluidLoadable), "DependencyContainer doesn't have IFluidLoadable");
            });

            it(`Registering then Unregistering then Registering`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.unregister(IFluidLoadable);
                dc.register(IFluidLoadable, new MockLoadable());
                assert(dc.has(IFluidLoadable), "DependencyContainer has IFluidLoadable");
            });

            it(`has() resolves correctly in all variations`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable & IFluidRouter>>();
                dc.register(IFluidLoadable, new MockLoadable());
                dc.register(IFluidRouter, new MockFluidRouter());
                assert(dc.has(IFluidLoadable), "Manager has IFluidLoadable");
                assert(dc.has(IFluidRouter), "Manager has IFluidRouter");
                assert(
                    dc.has(IFluidLoadable) && dc.has(IFluidRouter),
                    "Manager has IFluidLoadable & IFluidRouter");
            });

            it(`Child has Parent modules`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const loadableMock = new MockLoadable();
                parentDc.register(IFluidLoadable, loadableMock);
                const dc = new DependencyContainer<FluidObject<IFluidRouter>>(parentDc);
                const routerMock = new MockFluidRouter();
                dc.register(IFluidRouter, routerMock);

                assert(dc.has(IFluidLoadable), "has includes parent registered");
                assert(!dc.has(IFluidLoadable, true),"has does not include excluded parent registered");
                assert(dc.has(IFluidRouter),"has includes registered");
                assert(!dc.has(IFluidHandle),"does not include not registered");
            });

            it(`Parent Resolved from Child`, async () => {
                const parentDc = new DependencyContainer<FluidObject<IFluidHandle>>();
                const loadableToHandle: FluidObjectProvider<IProvideFluidHandle> =
                    async (fds: IFluidDependencySynthesizer) => {
                        const loadable = fds.synthesize<undefined, IProvideFluidLoadable>(undefined,{IFluidLoadable});
                        return (await loadable.IFluidLoadable).handle;
                    };
                parentDc.register(IFluidHandle, loadableToHandle);

                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>(parentDc);
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);

                const deps = dc.synthesize<IFluidHandle>({IFluidHandle}, undefined);
                assert(await deps.IFluidHandle !== undefined, "handle undefined");
            });

            it(`Undefined Provider is not Undefined`, async () => {
                const dc = new DependencyContainer();
                const deps = dc.synthesize<IFluidLoadable>({IFluidLoadable}, {});
                assert(deps.IFluidLoadable !== undefined, "handle undefined");
                assert(await deps.IFluidLoadable === undefined, "handle undefined");
            });

            it(`test getProvider backcompat`, async () => {
                const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
                const loadableMock = new MockLoadable();
                dc.register(IFluidLoadable, loadableMock);
                const testGetProvider = (deps: IFluidDependencySynthesizer, scenario: string)=>{
                    const old = deps as any as {
                        getProvider(key: "IFluidLoadable"): FluidObjectProvider<FluidObject<IFluidLoadable>>
                    };
                    const provider = old.getProvider("IFluidLoadable");
                    assert.equal(provider,loadableMock, scenario);
                };
                testGetProvider(dc, "direct");
                testGetProvider(new DependencyContainer(dc), "parent");
                testGetProvider(new PassThru<FluidObject<IFluidLoadable>>(dc), "pass thru");
                testGetProvider(new DependencyContainer(new PassThru<FluidObject<IFluidLoadable>>(dc)),
                    "pass thru as child");
            });
        });
    });
});

class PassThru<TMap> implements IFluidDependencySynthesizer {
    constructor(private readonly parent: IFluidDependencySynthesizer) {}
    synthesize<O, R = Record<string, never> | undefined>(
        optionalTypes: FluidObjectSymbolProvider<O>, requiredTypes: Required<FluidObjectSymbolProvider<R>>,
    ): AsyncFluidObjectProvider<O, R> {
        return this.parent.synthesize(optionalTypes, requiredTypes);
    }
    has(type: string): boolean {
        return this.parent.has(type);
    }
    readonly IFluidDependencySynthesizer = this;

    getProvider<K extends keyof TMap>(key: K): FluidObjectProvider<TMap[K]> | undefined {
        const maybe = this.parent as any as Partial<this>;
        if(maybe.getProvider) {
            return maybe.getProvider(key);
        }
    }
}
